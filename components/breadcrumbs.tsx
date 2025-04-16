import React from "react";

interface Breadcrumb {
  name: string;
  href?: string;
}

interface BreadcrumbsProps {
  breadcrumbs: Breadcrumb[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ breadcrumbs }) => {
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      <ol className="flex list-none p-0">
        {breadcrumbs.map((breadcrumb, index) => (
          <li key={index} className="flex items-center">
            {breadcrumb.href ? (
              <a
                href={breadcrumb.href}
                aria-current={
                  index === breadcrumbs.length - 1 ? "page" : undefined
                }
              >
                {breadcrumb.name}
              </a>
            ) : (
              <span aria-current="page">{breadcrumb.name}</span>
            )}
            {index < breadcrumbs.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
