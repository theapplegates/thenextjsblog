import { redirect } from 'next/navigation'

interface Params { locale: string }

export default async function Page({
  params,
}: {
  params: Promise<Params> | Params
}) {
  const { locale } = await Promise.resolve(params)
  redirect(`/${locale}/post`)
}
