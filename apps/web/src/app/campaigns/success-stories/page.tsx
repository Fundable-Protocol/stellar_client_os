import { SuccessStoriesShowcase } from "@/components/modules/campaign/SuccessStoriesShowcase";
import { getSuccessStories } from "@/services/campaign-success.service";
export const metadata = { title: "Success Stories | Fundable Protocol", description: "Completed campaigns and the impact they delivered." };
export default async function SuccessStoriesPage() { const stories = await getSuccessStories(); return <SuccessStoriesShowcase stories={stories} />; }
