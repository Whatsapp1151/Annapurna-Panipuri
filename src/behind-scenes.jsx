import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import './behind-scenes.css';
const bucket=()=>supabase.storage.from('behind-scenes');
const publicUrl=path=>bucket().getPublicUrl(path).data.publicUrl;
export function BehindScenes({onMenu}){
  const [clips,setClips]=useState([]),[playing,setPlaying]=useState(null),[failed,setFailed]=useState(false);
  useEffect(()=>{let alive=true;supabase.from('behind_scenes_clips').select('*').eq('active',true).order('slot').then(({data,error})=>{if(alive&&!error)setClips(data||[])});return ()=>{alive=false}},[]);
  if(!clips.length)return null;
  return <section className="behindScenes"><div className="sectionTitle"><h2>Behind the scenes</h2></div><p>See how we make your favourites.</p><div className="clipGrid">{clips.map(clip=><article key={clip.slot} className="clipCard">{playing===clip.slot?<><video controls autoPlay playsInline preload="none" src={publicUrl(clip.storage_path)} aria-label={clip.title} onError={()=>setFailed(true)} onEnded={()=>setPlaying(null)}/>{failed&&<p role="alert">This clip could not play. <a href={publicUrl(clip.storage_path)} target="_blank" rel="noopener noreferrer">Open video</a></p>}<button className="clipStop" onClick={()=>setPlaying(null)}>Close video</button></>:<button className="clipCover" onClick={()=>{setFailed(false);setPlaying(clip.slot)}} aria-label={'Play '+clip.title}><span aria-hidden="true">▶</span><span>Watch preparation</span></button>}<div className="clipCopy"><h3>{clip.title}</h3><p>{clip.description}</p><button className="secondary" onClick={onMenu}>Explore menu</button></div></article>)}</div></section>;
}
export function ClipManager(){
  const [clips,setClips]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
  async function load(){setLoading(true);try{const {data,error}=await supabase.from('behind_scenes_clips').select('*').order('slot');if(error)throw error;setClips(data||[])}catch(e){setMessage(e.message)}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  async function upload(e){e.preventDefault();if(busy)return;const form=e.currentTarget,fd=new FormData(form),file=fd.get('clip'),title=String(fd.get('title')||'').trim(),description=String(fd.get('description')||'').trim();
    if(!title||!description)return setMessage('Add a title and description.');
    if(!file?.size||!['video/mp4','video/webm'].includes(file.type))return setMessage('Choose an MP4 or WebM video. Export iPhone MOV clips as MP4 first.');
    if(file.size>20*1024*1024)return setMessage('Use a video smaller than 20 MB.');
    const slot=[1,2,3].find(n=>!clips.some(c=>c.slot===n));if(!slot)return setMessage('All 3 spaces are full. Delete a clip to add another.');
    const path=crypto.randomUUID()+(file.type==='video/mp4'?'.mp4':'.webm');let uploaded=false;setBusy(true);setMessage('Uploading… Keep this screen open.');
    try{const {error}=await bucket().upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded=true;
      const result=await supabase.from('behind_scenes_clips').insert({slot,title,description,storage_path:path,active:fd.get('active')==='on'});if(result.error)throw result.error;uploaded=false;form.reset();setMessage('Clip saved. It will appear when Home is next opened.');await load();
    }catch(e){if(uploaded)await bucket().remove([path]);setMessage(e.message||'Upload failed. Please try again.')}finally{setBusy(false)}
  }
  async function toggle(clip){setBusy(true);try{const {error}=await supabase.from('behind_scenes_clips').update({active:!clip.active}).eq('slot',clip.slot);if(error)throw error;setMessage(clip.active?'Clip hidden.':'Clip published.');await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  async function remove(clip){if(!confirm('Delete “'+clip.title+'” and its video?'))return;setBusy(true);try{const {error}=await supabase.from('behind_scenes_clips').delete().eq('slot',clip.slot);if(error)throw error;const result=await bucket().remove([clip.storage_path]);setMessage(result.error?'Clip removed from Home, but file cleanup failed. Contact support.':'Clip deleted.');await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  return <section className="clipManager"><h3>Behind-the-scenes clips</h3><p>Up to 3 short videos. MP4 or WebM, maximum 20 MB each. Aim for 10–20 seconds. Add any spoken information to the description or include captions in your video.</p><p role="status" aria-live="polite">{message}</p>{loading?<p>Loading clips…</p>:<>{clips.map(c=><div className="clipManageRow" key={c.slot}><div><b>{c.title}</b><small>{c.active?'Live':'Hidden'}</small></div><a href={publicUrl(c.storage_path)} target="_blank" rel="noopener noreferrer">Preview</a><button disabled={busy} onClick={()=>toggle(c)}>{c.active?'Hide':'Publish'}</button><button disabled={busy} onClick={()=>remove(c)}>Delete</button></div>)}{!clips.length&&<p>No clips uploaded yet.</p>}<form onSubmit={upload}><fieldset disabled={busy||clips.length>=3}><label>Clip title<input name="title" required maxLength={80} placeholder="Fresh panipuri, made to order"/></label><label>Description<textarea name="description" required maxLength={500} placeholder="Describe what customers will see in the clip."/></label><label>Video file<input name="clip" type="file" accept="video/mp4,video/webm" required/></label><label className="clipCheck"><input name="active" type="checkbox" defaultChecked/>Publish on Home</label><button className="primary" type="submit">{busy?'Please wait…':'Upload clip'}</button></fieldset></form></>}<button type="button" disabled={busy} onClick={load}>Refresh clips</button></section>;
}
