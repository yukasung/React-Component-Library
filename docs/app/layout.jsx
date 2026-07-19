import { Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata = {
  title: {
    default: 'React Component Library',
    template: '%s – React Component Library',
  },
  description: 'Docs for the internal React Component Library.',
}

const navbar = <Navbar logo={<b>React Component Library</b>} />

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/yukasung/React-Component-Library"
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
