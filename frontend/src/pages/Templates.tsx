import { useNavigate } from 'react-router-dom'
import { ENGAGEMENT_TEMPLATES, type Prefill } from '../lib/templates'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function Templates() {
  const navigate = useNavigate()

  function useTemplate(templateId: string) {
    const template = ENGAGEMENT_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    const prefill: Prefill = {
      title: template.title,
      description: template.description,
      verificationCriteria: template.verificationCriteria,
      deliveryMethod: template.deliveryMethod,
    }
    navigate('/app/create', { state: { prefill } })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="label-mono text-xs text-coral-600">Templates</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Start from a template</h1>
      <p className="mt-4 max-w-xl text-ink-soft">
        Every field stays editable after you pick one - these are just a proven starting point for common
        deliverable specs.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ENGAGEMENT_TEMPLATES.map((t) => (
          <Card key={t.id} className="flex flex-col p-5">
            <p className="label-mono text-[10px] text-coral-600">{t.label}</p>
            <p className="mt-1 font-display text-base font-semibold text-ink">{t.title}</p>
            <p className="mt-2 flex-1 text-sm text-ink-soft">{t.description}</p>
            <p className="mt-3 text-xs text-ink-soft/70">Delivery: {t.deliveryMethod}</p>
            <Button size="sm" className="mt-4 self-start" onClick={() => useTemplate(t.id)}>
              Use this template
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
