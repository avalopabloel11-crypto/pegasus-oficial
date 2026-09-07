import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const ip = (
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
    .split(',')[0]
    .trim();

  const body = await req.json().catch(() => null);

  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: allowed, error: rateError } = await supabase.rpc(
    'check_rate_limit',
    {
      p_key: `login:${ip}`,
      p_limit: 5,
      p_window_seconds: 60,
    }
  );

  if (rateError || allowed === false) {
    return NextResponse.json(
      {
        error:
          'Demasiados intentos. Esperá un minuto e intentá nuevamente.',
      },
      { status: 429 }
    );
  }

  if (
    body.email.toLowerCase() !==
    (process.env.ADMIN_EMAIL || '').toLowerCase()
  ) {
    return NextResponse.json(
      { error: 'Credenciales inválidas.' },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Credenciales inválidas.' },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}