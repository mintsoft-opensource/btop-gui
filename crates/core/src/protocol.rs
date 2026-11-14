use serde::{Deserialize, Serialize};

use crate::Snapshot;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Hello { token: String },
    Kill { pid: u32, force: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    #[serde(rename_all = "camelCase")]
    Welcome {
        protocol: u32,
        version: String,
        allow_kill: bool,
    },
    Snapshot {
        data: Box<Snapshot>,
    },
    #[serde(rename_all = "camelCase")]
    KillResult {
        pid: u32,
        ok: bool,
        message: String,
    },
    Error {
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_messages_use_tagged_camel_case_json() {
        let hello: ClientMessage = serde_json::from_str(r#"{"type":"hello","token":"t"}"#).unwrap();
        assert_eq!(hello, ClientMessage::Hello { token: "t".into() });
        let kill: ClientMessage = serde_json::from_str(r#"{"type":"kill","pid":42,"force":true}"#).unwrap();
        assert_eq!(kill, ClientMessage::Kill { pid: 42, force: true });
    }

    #[test]
    fn server_messages_serialize_with_type_tag() {
        let welcome = ServerMessage::Welcome {
            protocol: 1,
            version: "0.1.0".into(),
            allow_kill: false,
        };
        assert_eq!(
            serde_json::to_string(&welcome).unwrap(),
            r#"{"type":"welcome","protocol":1,"version":"0.1.0","allowKill":false}"#
        );
        let result = ServerMessage::KillResult {
            pid: 7,
            ok: true,
            message: "sent".into(),
        };
        assert_eq!(
            serde_json::to_string(&result).unwrap(),
            r#"{"type":"killResult","pid":7,"ok":true,"message":"sent"}"#
        );
    }
}
