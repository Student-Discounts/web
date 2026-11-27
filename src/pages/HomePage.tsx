import { ArrowRight, BookOpen, MapPin, Search, TicketPercent } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { query } from '@/lib/requests';

const steps = [
  { Icon: Search, heading: 'Найдите место', text: 'Ищите по названию, городу или типу скидки. Откройте карту, чтобы посмотреть, где находятся результаты.' },
  { Icon: TicketPercent, heading: 'Проверьте условия', text: 'В карточке места указаны предложения, условия, даты и часы действия.' },
  { Icon: BookOpen, heading: 'Поделитесь находкой', text: 'Предложите скидку или исправление. Изменения появятся в каталоге после проверки.' },
];

export function HomePage() {
  const navigate = useNavigate();
  return (
    <>
      <section className="relative isolate overflow-hidden rounded-3xl border bg-card px-5 py-12 sm:px-10 sm:py-16 lg:px-14">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 -z-10 size-[34rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="max-w-2xl space-y-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-medium text-primary">
            <MapPin className="size-4" aria-hidden="true" /> Каталог предложений
          </div>
          <h1 className="max-w-xl text-4xl leading-[1.06] font-bold tracking-tight text-balance sm:text-6xl">Карта студенческих скидок</h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">Узнайте, где действует студенческая скидка и что потребуется, чтобы её получить.</p>
          <form className="flex max-w-lg flex-wrap gap-2 pt-2 sm:flex-nowrap" onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
            navigate(`/search${query({ q: value })}`);
          }}>
            <Label htmlFor="landing-search" className="sr-only">Название места или условия скидки</Label>
            <Input id="landing-search" name="q" type="search" placeholder="Например, кофейня" className="h-11 min-w-0 flex-1 bg-background" />
            <Button type="submit" className="h-11 px-4"><Search aria-hidden="true" /> Найти</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="lg"><Link to="/search?view=map"><MapPin aria-hidden="true" /> Открыть карту</Link></Button>
            <Button asChild variant="ghost" size="lg"><Link to="/submissions/new">Предложить скидку <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Как пользоваться каталогом">
        {steps.map(({ Icon, heading, text }) => (
          <Card key={heading}>
            <CardContent className="space-y-2">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold">{heading}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}
