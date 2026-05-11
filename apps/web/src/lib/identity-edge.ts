import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Session } from "./session";

export async function resolveSessionStateFromRequest(request: NextRequest): Promise<{
  response: NextResponse;
  session: Session | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { response, session: null };
  }

  return {
    response,
    session: {
      userId: user.id,
      email: user.email ?? "",
      fullName: (user.user_metadata?.full_name as string | null) ?? null,
      expiresAt: 0,
    },
  };
}
