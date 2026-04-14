export interface DemoCatalogRecord {
  id: string
  name: string
  path: string
  parentId: string | null
  hasChild: boolean
  total: number
  contentType: string
  contentTypeName: string
}

export interface DemoContentRecord {
  id: string
  catalogId: string
  title: string
  summary: string
  publishUrl: string
  listLogoUrl?: string
  addedAt: string
  shape: string
  hotScore: number
  assetCounts: {
    images: number
    audios: number
    videos: number
    files: number
  }
}

export const demoCatalogs: DemoCatalogRecord[] = [
  {
    id: 'news',
    name: 'News',
    path: '/news',
    parentId: null,
    hasChild: false,
    total: 12,
    contentType: 'article',
    contentTypeName: 'Article',
  },
  {
    id: 'about',
    name: 'About',
    path: '/about',
    parentId: null,
    hasChild: true,
    total: 3,
    contentType: 'page',
    contentTypeName: 'Page',
  },
  {
    id: 'products',
    name: 'Products',
    path: '/products',
    parentId: null,
    hasChild: false,
    total: 5,
    contentType: 'product',
    contentTypeName: 'Product',
  },
  {
    id: 'about-team',
    name: 'Team',
    path: '/about/team',
    parentId: 'about',
    hasChild: false,
    total: 1,
    contentType: 'page',
    contentTypeName: 'Page',
  },
]

export const demoContents: DemoContentRecord[] = [
  {
    id: 'content-launch-update',
    catalogId: 'news',
    title: 'Launch Update',
    summary: 'A short summary for the latest product launch update.',
    publishUrl: '/news/launch-update',
    listLogoUrl: 'https://img.example.com/launch-update.png',
    addedAt: '2026-04-12T09:00:00.000Z',
    shape: 'article',
    hotScore: 90,
    assetCounts: {
      images: 1,
      audios: 0,
      videos: 0,
      files: 0,
    },
  },
  {
    id: 'content-quarterly-results',
    catalogId: 'news',
    title: 'Quarterly Results',
    summary: 'Highlights from the latest quarterly report and business trends.',
    publishUrl: '/news/quarterly-results',
    addedAt: '2026-04-08T08:00:00.000Z',
    shape: 'article',
    hotScore: 72,
    assetCounts: {
      images: 0,
      audios: 0,
      videos: 0,
      files: 1,
    },
  },
  {
    id: 'content-roadmap',
    catalogId: 'news',
    title: 'Roadmap Preview',
    summary: 'A preview of upcoming milestones for the next release cycle.',
    publishUrl: '/news/roadmap-preview',
    listLogoUrl: 'https://img.example.com/roadmap-preview.png',
    addedAt: '2026-03-20T10:00:00.000Z',
    shape: 'article',
    hotScore: 61,
    assetCounts: {
      images: 1,
      audios: 0,
      videos: 0,
      files: 0,
    },
  },
  {
    id: 'content-about-overview',
    catalogId: 'about',
    title: 'About the Team',
    summary: 'Who we are and how the product team is organized.',
    publishUrl: '/about/team',
    addedAt: '2026-02-14T12:00:00.000Z',
    shape: 'page',
    hotScore: 35,
    assetCounts: {
      images: 0,
      audios: 0,
      videos: 0,
      files: 0,
    },
  },
]
