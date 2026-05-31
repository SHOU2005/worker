import fs from 'fs'
import path from 'path'
import DeckNav from '../DeckNav'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Switch — Pre-Seed (v2)',
  description: 'Switch — on-demand workers for commercial India. Pronto/Snabbit for commercial.',
  robots: { index: false, follow: false },
}

export default function DeckV2Page() {
  const html  = fs.readFileSync(path.join(process.cwd(), 'public/deck-v2.html'), 'utf8')
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const body  = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '')
                  .replace(/<script[\s\S]*?<\/script>/g, '')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <DeckNav />
    </>
  )
}
