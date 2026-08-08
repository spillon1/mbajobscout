import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkListingStatus } from './job-expiry.ts';

Deno.test('detects the Venture5 expired-listing banner', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(
    '<html><body><div class="job-manager-info">This listing has expired.</div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  ));

  try {
    assertEquals(await checkListingStatus('https://venture5.com/job/example/'), 'expired');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('does not expire a live listing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(
    '<html><body><h1>VC Associate</h1><a>Apply now</a></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  ));

  try {
    assertEquals(await checkListingStatus('https://venture5.com/job/example/'), 'live');
  } finally {
    globalThis.fetch = originalFetch;
  }
});