import type { Metadata } from "next";
import Link from "next/link";
import { getBlogPosts, getBlogCategories } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "News, tutorials, and insights about Gaussian splatting virtual tours from the CloudTour team.",
  openGraph: {
    title: "Blog — CloudTour",
    description:
      "News, tutorials, and insights about Gaussian splatting virtual tours from the CloudTour team.",
    url: "/blog",
  },
  twitter: {
    card: "summary",
    title: "Blog — CloudTour",
    description:
      "News, tutorials, and insights about Gaussian splatting virtual tours from the CloudTour team.",
  },
};

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

export default function BlogPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const allPosts = getBlogPosts();
  const categories = getBlogCategories();
  const activeCategory = searchParams.category;

  const posts = activeCategory
    ? allPosts.filter((p) => p.category === activeCategory)
    : allPosts;

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-display text-xl font-semibold text-text-primary"
          >
            CloudTour
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/explore" className="hover:text-text-primary transition-colors duration-fast">
              Explore
            </Link>
            <Link href="/pricing" className="hover:text-text-primary transition-colors duration-fast">
              Pricing
            </Link>
            <Link href="/blog" className="text-text-primary font-medium">
              Blog
            </Link>
            <Link
              href="/login"
              className="hover:text-text-primary transition-colors duration-fast"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-display text-display-md font-light text-text-primary mb-3">
            Blog
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl">
            News, tutorials, and insights about spatial tours and Gaussian
            splatting technology.
          </p>
        </div>

        {/* Category filters */}
        <div className="mb-10 flex flex-wrap gap-2">
          <Link
            href="/blog"
            className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-fast ${
              !activeCategory
                ? "bg-brand text-white"
                : "bg-surface-alt text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/blog?category=${cat}`}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-fast ${
                activeCategory === cat
                  ? "bg-brand text-white"
                  : "bg-surface-alt text-text-secondary hover:text-text-primary"
              }`}
            >
              {categoryLabel(cat)}
            </Link>
          ))}
        </div>

        {/* Post grid */}
        {posts.length === 0 ? (
          <p className="text-text-secondary py-12">
            No posts found in this category.
          </p>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            {posts.map((post, i) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group block ${i === 0 ? "md:col-span-2" : ""}`}
              >
                <article
                  className={`rounded-lg border border-border/40 bg-surface p-6 transition-all duration-base hover:border-brand/30 hover:shadow-sm ${
                    i === 0 ? "md:p-8" : ""
                  }`}
                >
                  <div className="mb-3 flex items-center gap-3 text-sm text-text-secondary">
                    <span className="rounded-full bg-surface-alt px-3 py-0.5 text-xs font-medium">
                      {categoryLabel(post.category)}
                    </span>
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                  </div>
                  <h2
                    className={`font-display font-medium text-text-primary group-hover:text-brand transition-colors duration-fast ${
                      i === 0 ? "text-display-sm" : "text-xl"
                    }`}
                  >
                    {post.title}
                  </h2>
                  <p className="mt-2 text-text-secondary leading-relaxed">
                    {post.description}
                  </p>
                  <p className="mt-4 text-sm font-medium text-brand">
                    Read more &rarr;
                  </p>
                </article>
              </Link>
            ))}
          </div>
        )}
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
