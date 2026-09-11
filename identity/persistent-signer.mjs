import {execFileSync,spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {dirname,resolve} from "node:path";

const MAX_RESPONSE_BYTES=65536;
const TIMEOUT_MS=10000;
const MAX_ROOM_TEXT_BYTES=4096;
const PROVENANCE_ROOM="d-flop-infra";

function paths(root){
  const direct=resolve(root,"..","technocore-did-starter");
  let starter=direct;
  if(!existsSync(starter)){
    try{
      const common=execFileSync("git",["-C",root,"rev-parse","--path-format=absolute","--git-common-dir"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000}).trim();
      const sibling=resolve(dirname(common),"..","technocore-did-starter");
      if(existsSync(sibling))starter=sibling;
    }catch{/* Missing Git metadata leaves the direct deployment layout as the only option. */}
  }
  return{
    python:resolve(starter,".venv","Scripts","python.exe"),
    client:resolve(starter,"signer_client.py"),
    enroll:resolve(starter,"local_signer_enroll.py"),
  };
}

export function requestPersistentSigner(root,value,spawnImpl=spawn){
  return new Promise((resolvePromise,reject)=>{
    const selected=paths(root);
    if(!existsSync(selected.python)||!existsSync(selected.client))return reject(Error("PERSISTENT_SIGNER_BRIDGE_UNAVAILABLE"));
    const child=spawnImpl(selected.python,[selected.client],{stdio:["pipe","pipe","ignore"],windowsHide:true}),chunks=[];
    let size=0,settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
    const timer=setTimeout(()=>{child.kill();finish(reject,Error("PERSISTENT_SIGNER_TIMEOUT"));},TIMEOUT_MS);
    child.stdout.on("data",chunk=>{size+=chunk.length;if(size>MAX_RESPONSE_BYTES){child.kill();finish(reject,Error("PERSISTENT_SIGNER_RESPONSE_TOO_LARGE"));}else chunks.push(chunk);});
    child.on("error",error=>finish(reject,error));
    child.on("close",code=>{if(code!==0)return finish(reject,Error("PERSISTENT_SIGNER_UNAVAILABLE"));try{finish(resolvePromise,JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{finish(reject,Error("PERSISTENT_SIGNER_INVALID_RESPONSE"));}});
    child.stdin.end(JSON.stringify(value));
  });
}

export async function loadPersistentSigner(root,expectedDid,requester=requestPersistentSigner){
  let status;
  try{status=await requester(root,{operation:"status"});}catch{return null;}
  if(status?.ok!==true||typeof status.did!=="string")return null;
  if(status.did!==expectedDid)throw Error("PERSISTENT_SIGNER_DID_MISMATCH");
  return{
    async did(){return status.did;},
    async signCanonical(payload){
      if(typeof payload!=="string")throw Error("INVALID_CANONICAL_SIGN_PAYLOAD");
      const prefix=`technocore-proof-of-control-v1|${expectedDid}|`;
      if(!payload.startsWith(prefix)||payload.length>512||/[\r\n\u0000-\u001f\u007f]/.test(payload))throw Error("UNAUTHORIZED_CANONICAL_SIGN_PAYLOAD");
      const response=await requester(root,{operation:"proof_of_control",payload}),proof=response?.proof;
      if(response?.ok!==true||proof?.did!==expectedDid||proof?.payload!==payload||typeof proof.signature!=="string")throw Error("PERSISTENT_SIGNER_INVALID_PROOF");
      return proof.signature;
    },
    async signRoomMessage(room,text){
      if(room!==PROVENANCE_ROOM)throw Error("UNAUTHORIZED_TECHNOCORE_ROOM");
      if(typeof text!=="string"||text.length===0||Buffer.byteLength(text,"utf8")>MAX_ROOM_TEXT_BYTES||/[\r\n\u0000-\u001f\u007f]/.test(text))throw Error("INVALID_TECHNOCORE_ROOM_TEXT");
      const response=await requester(root,{operation:"sign_technocore_room_message",room,text}),signed=response?.signed;
      if(response?.ok!==true||signed?.did!==expectedDid||signed?.room!==room||signed?.text!==text)throw Error("PERSISTENT_SIGNER_INVALID_ENVELOPE");
      return signed;
    },
  };
}

export async function persistentSignerStatus(root,expectedDid,requester=requestPersistentSigner){
  try{
    const signer=await loadPersistentSigner(root,expectedDid,requester);
    return signer?{status:"ENROLLED",did:await signer.did()}:{status:"SIGNER_UNAVAILABLE"};
  }catch(error){return{status:"SIGNER_MISMATCH",reason:error instanceof Error?error.message:"SIGNER_MISMATCH"};}
}

export async function enrollPersistentSigner(root,expectedDid,spawnImpl=spawn){
  const existing=await loadPersistentSigner(root,expectedDid);
  if(existing)return{status:"ALREADY_ENROLLED",did:await existing.did()};
  const selected=paths(root);
  if(!process.stdin.isTTY||!process.stderr.isTTY)throw Error("INTERACTIVE_TTY_REQUIRED");
  if(!existsSync(selected.enroll))throw Error("SIGNER_ENROLL_HELPER_UNAVAILABLE");
  await new Promise((resolvePromise,reject)=>{
    const child=spawnImpl(selected.python,[selected.enroll],{stdio:"inherit",windowsHide:false});
    child.on("error",reject);
    child.on("close",code=>code===0?resolvePromise():reject(Error("SIGNER_ENROLL_FAILED")));
  });
  const signer=await loadPersistentSigner(root,expectedDid);
  if(!signer)throw Error("SIGNER_ENROLL_VERIFICATION_FAILED");
  return{status:"ENROLLMENT_SUCCESS",did:await signer.did()};
}
