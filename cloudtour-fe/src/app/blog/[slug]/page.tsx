import type { Metadata } from "next";
import Link from "next/link";
import { PublicNavbar } from "@/components/public-site/public-navbar";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getBlogPost, getBlogPosts } from "@/lib/blog";

interface BlogPostPageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return getBlogPosts().map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: BlogPostPageProps): Metadata {
  const post = getBlogPost(params.slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: `${post.title} — CloudTour Blog`,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      url: `/blog/${post.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} — CloudTour Blog`,
      description: post.description,
    },
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function categoryLabel(category: string): string {
  return category
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <PublicNavbar offset />

      <main className="mx-auto max-w-3xl px-6 py-16">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast"
        >
          &larr; Back to blog
        </Link>

        {/* Article header */}
        <article>
          <header className="mb-10">
            <div className="mb-4 flex items-center gap-3 text-sm text-text-secondary">
              <Link
                href={`/blog?category=${post.category}`}
                className="rounded-full bg-surface-alt px-3 py-0.5 text-xs font-medium hover:bg-brand/10 transition-colors duration-fast"
              >
                {categoryLabel(post.category)}
              </Link>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span>&middot;</span>
              <span>{post.author}</span>
            </div>
            <h1 className="font-display text-display-md font-light text-text-primary leading-tight">
              {post.title}
            </h1>
          </header>

          {/* MDX content */}
          <div className="prose prose-lg max-w-none text-text-primary prose-headings:font-display prose-headings:font-medium prose-headings:text-text-primary prose-p:text-text-secondary prose-a:text-brand prose-a:no-underline hover:prose-a:underline prose-strong:text-text-primary prose-li:text-text-secondary prose-ul:text-text-secondary prose-ol:text-text-secondary">
            <MDXRemote source={post.content} />
          </div>
        </article>

        {/* Divider */}
        <hr className="my-12 border-border/40" />

        {/* CTA */}
        <div className="text-center">
          <p className="text-text-secondary mb-4">
            Ready to create your own spatial tours?
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-accent px-6 py-3 font-medium text-text-primary transition-colors duration-base hover:bg-accent-light"
          >
            Get started for free &rarr;
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-5xl px-6 text-sm text-text-secondary">
          &copy; {new Date().getFullYear()} CloudTour. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
