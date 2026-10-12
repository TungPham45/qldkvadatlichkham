import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { notificationApi, type AppNotification } from '../features/clinical/api';
import { useAuth } from '../stores/auth-store';

export function NotificationBell(){
  const {user}=useAuth(); const navigate=useNavigate(); const ref=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);const [items,setItems]=useState<AppNotification[]>([]);const [count,setCount]=useState(0);const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!user)return;try{const [page,total]=await Promise.all([notificationApi.list({page:1,limit:6}),notificationApi.count()]);setItems(page.items);setCount(total);setError('')}catch(e){setError(errorMessage(e))}},[user?.id]);
  useEffect(()=>{setItems([]);setCount(0);if(!user)return;void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer)},[load,user?.id]);
  useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(e.target instanceof Node&&!ref.current?.contains(e.target))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
  async function read(item:AppNotification){if(!item.readAt){await notificationApi.read(item.id);setCount(v=>Math.max(0,v-1));setItems(v=>v.map(x=>x.id===item.id?{...x,readAt:new Date().toISOString()}:x))}}
  async function readAll(){await notificationApi.readAll();setCount(0);setItems(v=>v.map(x=>({...x,readAt:x.readAt||new Date().toISOString()})))}
  return <div className="notification-bell" ref={ref}><button type="button" className="notification-bell__button" aria-label="Thông báo" onClick={()=>setOpen(v=>!v)}>🔔{count>0?<b>{count>99?'99+':count}</b>:null}</button>{open?<section className="notification-panel"><header><strong>Thông báo</strong>{count>0?<button type="button" onClick={()=>void readAll()}>Đọc tất cả</button>:null}</header>{error?<p className="notification-panel__error">{error}</p>:items.length===0?<p className="notification-panel__empty">Bạn chưa có thông báo.</p>:items.map(item=><button type="button" key={item.id} className={item.readAt?'':'is-unread'} onClick={()=>void read(item)}><strong>{item.title}</strong><span>{item.content}</span><small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small></button>)}<footer><button type="button" onClick={()=>{setOpen(false);navigate('/notifications')}}>Xem tất cả</button></footer></section>:null}</div>
}
