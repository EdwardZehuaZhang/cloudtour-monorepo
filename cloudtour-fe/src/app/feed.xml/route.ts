import RSS from "rss";
import { getBlogPosts } from "@/lib/blog";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://cloudtour.app";

export function GET() {
  const posts = getBlogPosts();

  const feed = new RSS({
    title: "CloudTour Blog",
    description:
      "News, tutorials, and insights about Gaussian splatting virtual tours from the CloudTour team.",
    site_url: APP_URL,
    feed_url: `${APP_URL}/feed.xml`,
    language: "en",
    pubDate: posts[0]?.date ? new Date(posts[0].date) : new Date(),
    copyright: `${new Date().getFullYear()} CloudTour`,
  });

  for (const post of posts) {
    feed.item({
      title: post.title,
      description: post.description,
      url: `${APP_URL}/blog/${post.slug}`,
      categories: [post.category],
      author: post.author,
      date: new Date(post.date),
    });
  }

  return new Response(feed.xml({ indent: true }), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
