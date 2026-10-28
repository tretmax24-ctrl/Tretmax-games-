import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

export function PageShell({ children }: { children: ReactNode }) { return <><Header /><main className="page-main">{children}</main><Footer /></> }
