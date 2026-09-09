'use client';
import { useState } from 'react';
import Image from 'next/image';

export default function Catalog({ designs, whatsapp, custom }: { designs:any[]; whatsapp:string; custom:Record<string,string> }) {
  const [filter,setFilter]=useState('todos');
  const cats=[['todos','TODOS'],['match','MATCH'],['futbol','FÚTBOL'],['anime','ANIME'],['empresariales','EMPRESARIALES']];
  const list=designs.filter(d=>filter==='todos'||d.category===filter);
  const wa=(d?:any)=>{ const msg=d?`Hola Pegasus 👋 Quiero consultar por el diseño #${d.code} (${d.name}).`:`Hola Pegasus 👋 Quiero consultar por un diseño personalizado. Necesito asesoramiento sobre medidas, tipo de diseño y precio.`; window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`,'_blank'); };
  return <>
    <nav className="filters">{cats.map(([v,l])=><button key={v} className={'filter '+(filter===v?'active':'')} onClick={()=>setFilter(v)}>{l}</button>)}</nav>
    <section className="catalog">{list.map(d=><article className="card" key={d.id}><div className="card-image" style={{position:'relative', aspectRatio:'1/1', background:'#f5f5f5'}}><Image src={d.image_url} alt={d.name} fill sizes="(max-width: 768px) 100vw, 400px" style={{objectFit:'contain'}}/></div><div className="card-info"><h2 className="card-name">PEGASUS #{d.code} · {d.name}</h2><div className="card-meta">{d.category} · {d.size || 'Consultar medida'}</div>{d.price&&<div className="price">{d.price}</div>}<button className="ask" onClick={()=>wa(d)}>QUIERO ESTE DISEÑO</button></div></article>)}</section>
    <section className="custom"><span className="kicker">PEGASUS / PERSONALIZADO</span><h2>{custom.custom_title || 'DISEÑO PERSONALIZADO'}</h2><p>{custom.custom_description || 'Comunicáte conmigo para consultar medidas, tipo de diseño, precio y recibir un asesoramiento personalizado.'}</p><button className="primary" onClick={()=>wa()}>💬 {custom.custom_button || 'CONSULTAR DISEÑO PERSONALIZADO'}</button></section>
  </>;
}