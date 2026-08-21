import { redirect } from 'next/navigation'

/**
 * This CMS holds blog articles and nothing else — newwebsite.builders itself is
 * a static site on Netlify. There is no home page document to render here, so
 * the root goes where the only content lives.
 *
 * The blog rendered on this host is a preview for editors, not the public site;
 * robots.txt returns `Disallow: /` for any host that is not the public one.
 */
export default function Home() {
  redirect('/blog')
}
