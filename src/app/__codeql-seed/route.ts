import { exec } from 'node:child_process';

export const dynamic = 'force-dynamic';

/**
 * Throwaway fixture for verifying CodeQL merge protection (#84): the command
 * comes straight from the query string, so CodeQL should report a command
 * injection. It must never reach main.
 */
export async function GET(request: Request): Promise<Response> {
  const command = new URL(request.url).searchParams.get('cmd') ?? 'echo safe';
  return new Promise((resolve) => {
    exec(command, (error, stdout) => {
      resolve(new Response(stdout.length > 0 ? stdout : (error?.message ?? 'done')));
    });
  });
}
