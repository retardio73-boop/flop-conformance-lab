import {verifyDidSignature} from "./core.mjs";
import {requestPersistentSigner} from "./persistent-signer.mjs";
import {SONNET_WRITER_DID, SonnetSignerCapability} from "../dist/src/sonnet.js";
import {RecordedDiscussionCapability} from "../dist/src/sonnet-discussion.js";

export async function loadSonnetSignerCapability(root, requester = requestPersistentSigner) {
  const status = await requester(root, {operation: "status"});
  if (status?.ok !== true || status.did !== SONNET_WRITER_DID) throw Error("SIGNER_CONTEXT_BLOCKED");
  const boundary = {
    async did() { return status.did; },
    async signRoomMessage(room, text) {
      const response = await requester(root, {operation: "sign_technocore_room_message", room, text});
      const signed = response?.signed;
      if (response?.ok !== true || signed?.did !== SONNET_WRITER_DID || signed?.room !== room || signed?.text !== text) throw Error("SIGNER_CONTEXT_BLOCKED");
      if (!verifyDidSignature(signed.did, `${signed.room}|${signed.nonce}|${signed.text}`, signed.signature)) throw Error("SONNET_SIGNER_INVALID_SIGNATURE");
      return signed;
    },
  };
  return new SonnetSignerCapability(boundary);
}

export async function loadSonnetCapabilities(root, requester = requestPersistentSigner) {
  const status = await requester(root, {operation: "status"});
  if (status?.ok !== true || status.did !== SONNET_WRITER_DID) throw Error("SIGNER_CONTEXT_BLOCKED");
  const boundary = {
    async did() { return status.did; },
    async signRoomMessage(room, text) {
      const response = await requester(root, {operation: "sign_technocore_room_message", room, text});
      const signed = response?.signed;
      if (response?.ok !== true || signed?.did !== SONNET_WRITER_DID || signed?.room !== room || signed?.text !== text) throw Error("SIGNER_CONTEXT_BLOCKED");
      if (!verifyDidSignature(signed.did, `${signed.room}|${signed.nonce}|${signed.text}`, signed.signature)) throw Error("SONNET_SIGNER_INVALID_SIGNATURE");
      return signed;
    },
  };
  return {actionable: new SonnetSignerCapability(boundary), discussion: new RecordedDiscussionCapability(boundary)};
}
