import llms from '../lib/generated/llms.txt?raw'

// Served with an explicit charset: a static llms.txt would go out as
// text/plain without one and browsers would render the UTF-8 punctuation
// as Latin-1 mojibake
export const GET = (): Response =>
  new Response(llms, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
