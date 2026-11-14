use std::net::SocketAddr;
use std::time::Duration;

use btop_gui_agent::{Config, generate_token, serve};
use clap::Parser;
use tokio::net::TcpListener;

#[derive(Parser)]
#[command(version, about = "Stream system metrics to btop-gui over WebSocket")]
struct Args {
    #[arg(long, env = "BTOP_GUI_BIND", default_value = "127.0.0.1:9100")]
    bind: SocketAddr,
    #[arg(long, env = "BTOP_GUI_TOKEN", hide_env_values = true)]
    token: Option<String>,
    #[arg(long, env = "BTOP_GUI_INTERVAL_MS", default_value_t = 1000, value_parser = clap::value_parser!(u64).range(250..=60_000))]
    interval_ms: u64,
    #[arg(long, env = "BTOP_GUI_ALLOW_KILL")]
    allow_kill: bool,
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt().with_target(false).init();
    let args = Args::parse();
    let token = match args.token.filter(|token| !token.trim().is_empty()) {
        Some(token) => token,
        None => {
            let token = generate_token();
            tracing::warn!("BTOP_GUI_TOKEN is not set; generated a one-time token: {token}");
            token
        }
    };
    let listener = TcpListener::bind(args.bind).await?;
    tracing::info!(bind = %args.bind, allow_kill = args.allow_kill, "btop-gui agent listening on ws://{}/ws", args.bind);
    let config = Config {
        token,
        allow_kill: args.allow_kill,
        interval: Duration::from_millis(args.interval_ms),
    };
    serve(listener, config, shutdown()).await
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("signal handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}
