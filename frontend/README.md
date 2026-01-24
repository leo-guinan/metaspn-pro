# MetaSPN Pro Frontend

Next.js frontend for podcast intelligence layer.

## Tech Stack

- **Next.js 14+**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **React Query**: Server state management
- **Recharts**: Data visualization

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Listener dashboard
│   ├── podcast/[id]/      # Podcast detail page
│   ├── episode/[id]/      # Episode detail page
│   ├── import/            # Data import UI
│   ├── notes/            # Expression capture
│   └── import-expressions/ # Platform imports
├── components/            # React components
│   └── dashboard/         # Dashboard components
└── lib/                   # Utilities
    └── api.ts            # API client
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Features

- Listener dashboard with stats and charts
- Podcast and episode detail pages
- Fan Proof sharing
- Data import (CSV/JSONL)
- Expression capture (notes, Twitter, Bluesky, GitHub)
- Influence timeline visualization
