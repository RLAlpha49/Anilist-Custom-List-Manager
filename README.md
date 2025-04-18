# Anilist Custom List Manager

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Demo](#demo)
- [Contributing](#contributing)
- [License](#license)

## Introduction

**Anilist Custom List Manager** is a tool designed to enhance your Anilist experience by allowing you to manage your anime and manga lists effortlessly. It's built with [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), and [Radix UI](https://www.radix-ui.com/). Learn more about the [Anilist API](https://docs.anilist.co/).

## Features

| Feature                      | Description                                                                                         |
|------------------------------|-----------------------------------------------------------------------------------------------------|
| Fetch Anime and Manga Lists  | Easily retrieve your existing lists from Anilist.                                                  |
| Custom List Management       | Organize your entries into personalized lists for better tracking and organization.                |
| Sort Entries                 | Sort your entries based on status, score, rereads, genres, tags, and type to quickly find what you're looking for. |
| Automatic Updates            | Automatically update entries based on the conditions you set, ensuring your lists are up-to-date.  |
| User-Friendly Interface      | Clean and intuitive UI using Next.js, Tailwind CSS, and Radix UI components.                       |

## Prerequisites

- Node.js v16 or newer
- npm v8+ or Yarn v1.22+

## Project Structure

```
app/                 # Next.js App Router routes and layouts
components/          # Reusable React UI components
context/             # React Context providers and hooks for global state
lib/                 # Shared utility functions and modules
public/              # Static assets served at root
tailwind.config.ts   # Tailwind CSS configuration
tsconfig.json        # TypeScript compiler options
next.config.js       # Next.js custom configuration
.eslint.config.mjs   # ESLint linting rules
```

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/RLAlpha49/anilist-custom-list-manager.git
   cd anilist-custom-list-manager
   ```

2. Install dependencies:

   ```bash
   # npm
   npm install

   # or Yarn
   yarn install
   ```

3. Configure environment variables:

   Create a `.env` file in the root directory and add your Anilist API credentials:

   ```env
   NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id
   ```

## Usage

- Start development server:

  ```bash
  npm run dev
  # or yarn dev
  ```

- Build for production:

  ```bash
  npm run build
  # or yarn build
  ```

- Start production server:

  ```bash
  npm run start
  # or yarn start
  ```

- Run linting:

  ```bash
  npm run lint
  ```

- Check code formatting:

  ```bash
  npm run format
  ```

- Fix code formatting:

  ```bash
  npm run format:write
  ```

- Update dependencies (excluding Tailwind CSS):

  ```bash
  npm run update
  ```

## Demo

## Contributing

Contributions are welcome! Please open issues and PRs via [GitHub Issues](https://github.com/RLAlpha49/anilist-custom-list-manager/issues).  
Make sure to follow the existing code style by running lint and format scripts before submitting:

```bash
npm run lint
npm run format:write
```

## License

This project is licensed under the [MIT License](LICENSE).
