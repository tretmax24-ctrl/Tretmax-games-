export function PageHeading({ kicker, title, highlight, copy }: { kicker: string; title: string; highlight?: string; copy: string }) {
  return <div className="page-heading"><div className="section-kicker"><span />{kicker}</div><h1>{title} {highlight && <span>{highlight}</span>}</h1><p>{copy}</p></div>
}
