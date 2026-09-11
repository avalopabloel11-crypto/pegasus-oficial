import { createServerSupabase } from '@/lib/supabase-server'
import Catalog from '@/components/Catalog';

export default async function Home() {
  const supabase = await createServerSupabase();
  const [{ data: designs }, { data: content }] = await Promise.all([
    supabase.from('designs').select('*').eq('active', true).order('created_at', { ascending: false }),
    supabase.from('site_content').select('key,value')
  ]);
  const copy: Record<string,string> = {};
  (content ?? []).forEach((x:any) => copy[x.key] = x.value);
  return <>
    <header className="hero"><img src="/images/logo.png" className="logo" alt="Pegasus"/><p>{copy.hero_tagline || 'DISEÑOS DISPONIBLES PARA BORDAR'}</p></header>
    <main className="main"><section className="intro"><span className="kicker">PEGASUS EMBROIDERY</span><h1>{copy.hero_title || 'Elegí tu diseño.'}</h1><p>{copy.hero_description || 'Encontrá un diseño y consultanos para bordarlo en tu prenda.'}</p></section>
      <Catalog designs={designs ?? []} whatsapp={process.env.WHATSAPP_NUMBER || '5493436122634'} custom={copy} />
    </main>
    <footer className="footer"><strong>PEGASUS</strong><p>Diseños para bordado</p><a href="/preguntas-frecuentes" style={{display:'inline-block', background:'#f5a623', color:'#000', fontWeight:'bold', padding:'10px 20px', borderRadius:'8px', textDecoration:'none', margin:'8px'}}>PREGUNTAS FRECUENTES</a><a className="admin-link" href="/admin">ADMINISTRAR</a></footer>
  </>;
}
