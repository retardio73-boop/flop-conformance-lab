import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  TARGET_DID,TARGET_FINGERPRINT,canonical,detectSigner,fingerprintForDid,
  ledgerDigest,publicKeyForDid,queueMilestone,renderProfile,sha256,
  validateConfig,validateLedgerRecord,validateMilestone,validateSignedEnvelope
} from "../core.mjs";
import {loadPersistentSigner,persistentSignerStatus} from "../persistent-signer.mjs";

const config={schemaVersion:"1",did:TARGET_DID,fingerprint:TARGET_FINGERPRINT,signerStatus:"SIGNER_UNAVAILABLE",github:{profile:"https://github.com/retardio73-boop"},technocore:{profilePath:"/kv/did-62/c0aca3721ba547",legacyProfilePath:"/kv/did/62c0aca3721ba547",buildRoom:"d-flop-infra",mailbox:null},projects:[{slug:"conformance-lab",url:"https://github.com/retardio73-boop/flop-conformance-lab",localPath:".",visibility:"PUBLIC_ACTIVE"}]};
const event={type:"provenance",project:"conformance-lab",summary:"created a durable public provenance boundary for repository artifacts",artifact:"https://github.com/retardio73-boop/flop-conformance-lab",commit:"0123456789abcdef0123456789abcdef01234567",createdAt:"2026-09-09T00:00:00.000Z"};
const B58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes){let value=BigInt(`0x${Buffer.from(bytes).toString("hex")}`),out="";while(value){out=B58[Number(value%58n)]+out;value/=58n;}for(const byte of bytes){if(byte!==0)break;out="1"+out;}return out||"1";}
function testDid(publicKey){const raw=publicKey.export({format:"der",type:"spki"}).subarray(-32);return `did:key:z${base58(Buffer.concat([Buffer.from([0xed,0x01]),raw]))}`;}

function root(){const r=mkdtempSync(join(tmpdir(),"flop-identity-"));mkdirSync(join(r,"identity","pending","events"),{recursive:true});mkdirSync(join(r,"activity"),{recursive:true});writeFileSync(join(r,"identity","builder.json"),JSON.stringify(config));writeFileSync(join(r,"activity","index.json"),JSON.stringify({schemaVersion:"1",did:TARGET_DID,fingerprints:[],metrics:{}}));return r;}

test("canonical DID, fingerprint and Ed25519 public key are exact",()=>{
  assert.equal(fingerprintForDid(TARGET_DID),TARGET_FINGERPRINT);
  assert.doesNotThrow(()=>publicKeyForDid(TARGET_DID));
  assert.equal(validateConfig(config).did,TARGET_DID);
  assert.throws(()=>validateConfig({...config,did:"did:key:zWrong"}),/DID_MISMATCH/);
});

test("signer capability detection is unavailable or fails closed on identity mismatch",async()=>{
  assert.deepEqual(await detectSigner(null),{status:"SIGNER_UNAVAILABLE"});
  const mismatch=await detectSigner({did:async()=>"did:key:zDifferent",signCanonical:async()=>{throw Error("must not sign");}});
  assert.equal(mismatch.status,"SIGNER_MISMATCH");
  assert.equal(mismatch.expectedDid,TARGET_DID);
});

test("persistent signer loads a real challenge signer and fails closed",async()=>{
  const pair=generateKeyPairSync("ed25519");
  const did=testDid(pair.publicKey);
  const requester=async(_root,request)=>request.operation==="status"
    ?{ok:true,did}
    :{ok:true,proof:{did,payload:request.payload,signature:sign(null,Buffer.from(request.payload),pair.privateKey).toString("base64url")}};
  const signer=await loadPersistentSigner("fixture",did,requester);
  assert.equal(await signer.did(),did);
  assert.deepEqual(await detectSigner(signer,did),{status:"SIGNER_AVAILABLE",did});
  assert.equal(await loadPersistentSigner("fixture",TARGET_DID,async()=>{throw Error("missing");}),null);
  await assert.rejects(()=>loadPersistentSigner("fixture",TARGET_DID,async()=>({ok:true,did:"did:key:zDifferent"})),/DID_MISMATCH/);
  assert.equal((await persistentSignerStatus("fixture",TARGET_DID,async()=>({ok:false,error:"CORRUPT"}))).status,"SIGNER_UNAVAILABLE");
});

test("persistent signer bridge rejects arbitrary canonical payloads and non-provenance rooms",async()=>{
  const pair=generateKeyPairSync("ed25519");
  const did=testDid(pair.publicKey);
  let requests=0;
  const requester=async(_root,request)=>{
    requests++;
    if(request.operation==="status")return{ok:true,did};
    throw Error("unexpected requester call");
  };
  const signer=await loadPersistentSigner("fixture",did,requester);
  await assert.rejects(()=>signer.signCanonical("arbitrary-payload"),/UNAUTHORIZED_CANONICAL_SIGN_PAYLOAD/);
  await assert.rejects(()=>signer.signRoomMessage("other-room","valid text"),/UNAUTHORIZED_TECHNOCORE_ROOM/);
  await assert.rejects(()=>signer.signRoomMessage("d-flop-infra","line one\nline two"),/INVALID_TECHNOCORE_ROOM_TEXT/);
  assert.equal(requests,1);
});

test("CLI wires the persistent signer instead of passing null",()=>{
  const cli=readFileSync(new URL("../cli.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(cli,/detectSigner\(null\)/);
  assert.match(cli,/loadPersistentSigner/);
});

test("profile routes and rendering are deterministic while preserving unknown fields",()=>{
  const existing="mailbox: d-existing | operator-note: retained";
  const a=renderProfile(config,existing),b=renderProfile(config,existing);
  assert.equal(a,b);
  assert.match(a,/did: did:key:z6Mks3Gk/);
  assert.match(a,/operator-note: retained/);
  assert.match(a,/mailbox: d-existing/);
  assert.equal(config.technocore.profilePath,"/kv/did-62/c0aca3721ba547");
  assert.equal(config.technocore.legacyProfilePath,"/kv/did/62c0aca3721ba547");
});

test("significant milestones are canonical and trivial activity is rejected",()=>{
  const a=validateMilestone(event,config),b=validateMilestone(event,config);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.text,`provenance | conformance-lab | ${event.summary} | ${event.artifact} | sha:${event.commit}`);
  assert.throws(()=>validateMilestone({...event,summary:"routine CI heartbeat update"},config),/TRIVIAL_OR_INVALID_EVENT/);
  assert.throws(()=>validateMilestone({...event,project:"private-core"},config),/PROJECT_NOT_PUBLIC_ACTIVE/);
});

test("pending queue is deterministic, deduplicated, and contains no fake coordinates",()=>{
  const r=root(),a=queueMilestone(r,event),b=queueMilestone(r,event);
  assert.deepEqual(a,b);
  assert.equal(a.status,"PENDING_SIGNER");
  assert.equal(a.did,TARGET_DID);
  assert.equal("nonce" in a,false);
  assert.equal("signature" in a,false);
  assert.equal("seq" in a,false);
});

test("ledger digests are deterministic and tampering is detected",()=>{
  const record={schemaVersion:"1",did:TARGET_DID,eventType:"provenance",project:"conformance-lab",summary:event.summary,artifact:event.artifact,commit:event.commit,fingerprint:sha256("fixture"),createdAt:event.createdAt,publicationStatus:"PENDING_SIGNER",verificationStatus:"UNVERIFIED"};
  record.digest=ledgerDigest(record);
  assert.equal(record.digest,ledgerDigest(record));
  assert.equal(validateLedgerRecord(record),true);
  assert.throws(()=>validateLedgerRecord({...record,summary:"tampered"}),/LEDGER_DIGEST_MISMATCH/);
});

test("signed envelopes require exact DID, decimal nonce, exact text, and valid signature",()=>{
  const pending={room:"d-flop-infra",text:"provenance | test"};
  assert.throws(()=>validateSignedEnvelope(pending,{did:TARGET_DID,room:pending.room,nonce:9007199254740993,signature:"x",text:pending.text}),/SIGNED_ENVELOPE_MISMATCH/);
  assert.throws(()=>validateSignedEnvelope(pending,{did:"did:key:zDifferent",room:pending.room,nonce:"9007199254740993",signature:"A".repeat(86),text:pending.text}),/SIGNED_ENVELOPE_MISMATCH/);
});

test("identity implementation contains no passphrase, seed import, or key generation path",()=>{
  const core=readFileSync(new URL("../core.mjs",import.meta.url),"utf8"),cli=readFileSync(new URL("../cli.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(core+cli,/identity\.pem|readline|createPrivateKey|generateKeyPair|seed phrase|passphrase/i);
  assert.equal(canonical({b:2,a:1}),'{"a":1,"b":2}');
});
