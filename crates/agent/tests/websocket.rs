use std::time::Duration;

use btop_gui_agent::{Config, serve};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

async fn start(allow_kill: bool) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let config = Config {
        token: "test-token".into(),
        allow_kill,
        interval: Duration::from_millis(250),
    };
    tokio::spawn(serve(listener, config, std::future::pending()));
    format!("ws://{address}/ws")
}

async fn next_json(socket: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin)) -> Value {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        if let Message::Text(text) = message {
            return serde_json::from_str(&text).unwrap();
        }
    }
}

#[tokio::test]
async fn rejects_a_wrong_token() {
    let (mut socket, _) = tokio_tungstenite::connect_async(start(false).await).await.unwrap();
    socket.send(Message::text(r#"{"type":"hello","token":"nope"}"#)).await.unwrap();
    assert_eq!(
        next_json(&mut socket).await,
        serde_json::json!({"type": "error", "message": "unauthorized"})
    );
}

#[tokio::test]
async fn streams_snapshots_after_hello_and_blocks_kill_by_default() {
    let (mut socket, _) = tokio_tungstenite::connect_async(start(false).await).await.unwrap();
    socket
        .send(Message::text(r#"{"type":"hello","token":"test-token"}"#))
        .await
        .unwrap();

    let welcome = next_json(&mut socket).await;
    assert_eq!(welcome["type"], "welcome");
    assert_eq!(welcome["allowKill"], false);

    let snapshot = loop {
        let message = next_json(&mut socket).await;
        if message["type"] == "snapshot" {
            break message;
        }
    };
    assert!(!snapshot["data"]["cpu"]["cores"].as_array().unwrap().is_empty());
    assert!(!snapshot["data"]["processes"].as_array().unwrap().is_empty());

    socket
        .send(Message::text(r#"{"type":"kill","pid":999999,"force":false}"#))
        .await
        .unwrap();
    let result = loop {
        let message = next_json(&mut socket).await;
        if message["type"] == "killResult" {
            break message;
        }
    };
    assert_eq!(result["ok"], false);
    assert_eq!(result["pid"], 999999);
}
