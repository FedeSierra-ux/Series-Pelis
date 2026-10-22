// Flix: el motor de la PC no usa WebRTC (solo pares TCP de trackers y DHT). simple-peer importa estos nombres;
// sin RTCPeerConnection marca WEBRTC_SUPPORT = false y bittorrent-tracker saltea los trackers ws/wss.
export const RTCPeerConnection = undefined
export const RTCSessionDescription = undefined
export const RTCIceCandidate = undefined
export const RTCIceTransport = undefined
export const RTCDataChannel = undefined
export const RTCSctpTransport = undefined
export const RTCDtlsTransport = undefined
export const RTCCertificate = undefined
export default {}
