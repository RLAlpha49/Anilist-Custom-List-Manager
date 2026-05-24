import Link from "next/link";
import React from "react";

interface Breadcrumb {
  name: string;
  href?: string;
}

interface BreadcrumbsProps {
  breadcrumbs: Breadcrumb[];
}

const isInternalHref = (href: string): boolean => {
  return !(
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//")
  );
};

const renderBreadcrumbContent = (
  breadcrumb: Breadcrumb,
  index: number,
  total: number,
) => {
  if (!breadcrumb.href) {
    return <span aria-current="page">{breadcrumb.name}</span>;
  }

  const ariaCurrent = index === total - 1 ? "page" : undefined;

  if (isInternalHref(breadcrumb.href)) {
    return (
      <Link href={breadcrumb.href} aria-current={ariaCurrent}>
        {breadcrumb.name}
      </Link>
    );
  }

  return (
    <a href={breadcrumb.href} aria-current={ariaCurrent}>
      {breadcrumb.name}
    </a>
  );
};

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ breadcrumbs }) => {
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      <ol className="flex list-none p-0">
        {breadcrumbs.map((breadcrumb, index) => (
          <li key={index} className="flex items-center">
            {renderBreadcrumbContent(breadcrumb, index, breadcrumbs.length)}
            {index < breadcrumbs.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
