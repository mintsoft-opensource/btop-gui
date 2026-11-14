use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use axum::routing::get;
use btop_gui_core::{ClientMessage, Collector, PROTOCOL_VERSION, ServerMessage, kill};
use tokio::net::TcpListener;
use tokio::sync::watch;

const HELLO_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_MESSAGE_BYTES: usize = 16 * 1024;

pub struct Config {
    pub token: String,
    pub allow_kill: bool,
    pub interval: Duration,
}

#[derive(Clone)]
struct AppState {
    config: Arc<Config>,
    snapshots: watch::Receiver<Option<Utf8Bytes>>,
    clients: Arc<AtomicUsize>,
}

struct ClientGuard(Arc<AtomicUsize>);

impl ClientGuard {
    fn new(clients: Arc<AtomicUsize>) -> Self {
        clients.fetch_add(1, Ordering::SeqCst);
        Self(clients)
    }
}

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn token_matches(given: &str, expected: &str) -> bool {
    let (given, expected) = (given.as_bytes(), expected.as_bytes());
    !expected.is_empty() && given.len() == expected.len() && given.iter().zip(expected).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

pub fn generate_token() -> String {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).expect("system random source unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn encode(message: &ServerMessage) -> Utf8Bytes {
    serde_json::to_string(message).expect("server messages always serialize").into()
}

fn start_sampler(interval: Duration, clients: Arc<AtomicUsize>) -> watch::Receiver<Option<Utf8Bytes>> {
    let (sender, receiver) = watch::channel(None);
    std::thread::spawn(move || {
        let mut collector = Collector::new();
        while !sender.is_closed() {
            if clients.load(Ordering::SeqCst) == 0 {
                sender.send_replace(None);
            } else {
                let snapshot = collector.sample();
                sender.send_replace(Some(encode(&ServerMessage::Snapshot { data: Box::new(snapshot) })));
            }
            std::thread::sleep(interval);
        }
    });
    receiver
}

pub fn router(config: Config) -> Router {
    let clients = Arc::new(AtomicUsize::new(0));
    let state = AppState {
        snapshots: start_sampler(config.interval, clients.clone()),
        config: Arc::new(config),
        clients,
    };
    Router::new()
        .route("/ws", get(upgrade))
        .route("/health", get(|| async { "ok" }))
        .with_state(state)
}

pub async fn serve(listener: TcpListener, config: Config, shutdown: impl Future<Output = ()> + Send + 'static) -> std::io::Result<()> {
    axum::serve(listener, router(config).into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown)
        .await
}

async fn upgrade(State(state): State<AppState>, socket: WebSocketUpgrade) -> Response {
    socket
        .max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| session(socket, state))
}

async fn authenticate(socket: &mut WebSocket, token: &str) -> bool {
    let Ok(Some(Ok(Message::Text(text)))) = tokio::time::timeout(HELLO_TIMEOUT, socket.recv()).await else {
        return false;
    };
    matches!(serde_json::from_str(&text), Ok(ClientMessage::Hello { token: given }) if token_matches(&given, token))
}

async fn session(mut socket: WebSocket, state: AppState) {
    if !authenticate(&mut socket, &state.config.token).await {
        tracing::warn!("rejected client: missing or invalid token");
        let _ = socket
            .send(Message::Text(encode(&ServerMessage::Error {
                message: "unauthorized".into(),
            })))
            .await;
        return;
    }
    let welcome = ServerMessage::Welcome {
        protocol: PROTOCOL_VERSION,
        version: env!("CARGO_PKG_VERSION").into(),
        allow_kill: state.config.allow_kill,
    };
    if socket.send(Message::Text(encode(&welcome))).await.is_err() {
        return;
    }

    let _guard = ClientGuard::new(state.clients.clone());
    let mut snapshots = state.snapshots.clone();
    loop {
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() {
                    break;
                }
                let latest = snapshots.borrow_and_update().clone();
                if let Some(text) = latest
                    && socket.send(Message::Text(text)).await.is_err()
                {
                    break;
                }
            }
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if let Ok(ClientMessage::Kill { pid, force }) = serde_json::from_str(&text) {
                        let reply = handle_kill(state.config.allow_kill, pid, force).await;
                        if socket.send(Message::Text(encode(&reply))).await.is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            },
        }
    }
}

async fn handle_kill(allowed: bool, pid: u32, force: bool) -> ServerMessage {
    if !allowed {
        return ServerMessage::KillResult {
            pid,
            ok: false,
            message: "process control is disabled on this agent".into(),
        };
    }
    let result = tokio::task::spawn_blocking(move || kill(pid, force))
        .await
        .unwrap_or_else(|error| Err(error.to_string()));
    tracing::info!(pid, force, ok = result.is_ok(), "kill requested");
    match result {
        Ok(()) => ServerMessage::KillResult {
            pid,
            ok: true,
            message: if force { "SIGKILL sent" } else { "SIGTERM sent" }.into(),
        },
        Err(message) => ServerMessage::KillResult { pid, ok: false, message },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_tokens_exactly() {
        assert!(token_matches("secret", "secret"));
        assert!(!token_matches("secreT", "secret"));
        assert!(!token_matches("secret1", "secret"));
        assert!(!token_matches("", ""));
    }

    #[test]
    fn generates_hex_tokens() {
        let token = generate_token();
        assert_eq!(token.len(), 48);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(token, generate_token());
    }
}
