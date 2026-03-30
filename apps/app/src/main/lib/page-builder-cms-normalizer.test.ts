import { describe, expect, test } from 'bun:test'
import {
  normalizePageBuilderCmsChannels,
  normalizePageBuilderCmsContentPage,
} from './page-builder-cms-normalizer'

describe('page builder cms normalizer', () => {
  test('normalizes nested channel trees into page-builder friendly fields', () => {
    const channels = normalizePageBuilderCmsChannels([
      {
        ID: 17677,
        parentID: 0,
        siteID: 277,
        path: 'lbt/',
        name: '轮播图',
        alias: 'lbt',
        contentType: '',
        contentTypeName: '',
        type: 'Default',
        treeLevel: 1,
        total: 15,
        childCount: 1,
        hasChild: true,
        link: 'https://demo.zving.com/test/lbt/',
        children: [{
          ID: 17765,
          parentID: 17677,
          siteID: 277,
          path: 'lbt/wz/',
          name: '文章',
          alias: 'lbt_wz',
          contentType: 'Article',
          contentTypeName: '文章',
          type: 'Default',
          treeLevel: 2,
          total: 11,
          childCount: 0,
          hasChild: false,
          link: 'https://demo.zving.com/test/lbt/wz/',
        }],
      },
    ])

    expect(channels).toEqual([{
      id: '17677',
      parentId: null,
      siteId: '277',
      name: '轮播图',
      alias: 'lbt',
      path: 'lbt/',
      contentType: null,
      contentTypeName: null,
      channelType: 'Default',
      treeLevel: 1,
      total: 15,
      childCount: 1,
      hasChild: true,
      link: 'https://demo.zving.com/test/lbt/',
      children: [{
        id: '17765',
        parentId: '17677',
        siteId: '277',
        name: '文章',
        alias: 'lbt_wz',
        path: 'lbt/wz/',
        contentType: 'Article',
        contentTypeName: '文章',
        channelType: 'Default',
        treeLevel: 2,
        total: 11,
        childCount: 0,
        hasChild: false,
        link: 'https://demo.zving.com/test/lbt/wz/',
        children: [],
      }],
    }])
  })

  test('normalizes content items and derives preview/news asset paths from extendJSON and list logos', () => {
    const page = normalizePageBuilderCmsContentPage({
      total: 2,
      data: [
        {
          ID: 511716,
          catalogID: 17680,
          mainCatalogID: 17680,
          title: '冰品市场“热”起来',
          summary: '摘要',
          publishDate: '2025-06-30 14:04:29',
          publishUrl: 'https://demo.zving.com/test/c/2025-06-30/511716.shtml',
          contentTypeID: 'Article',
          listLogo: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/2025/06/30/38925_361x300.jpeg',
          bodyText: '正文',
          imagesTotal: 1,
          videosTotal: 0,
          audiosTotal: 0,
          filesTotal: 0,
          extendJSON: JSON.stringify({
            firstImage: 'upload/resources/image/2025/06/30/38925.jpeg',
            richTitle: '冰品市场“热”起来',
          }),
        },
        {
          ID: 508116,
          catalogID: 17718,
          mainCatalogID: 17718,
          title: '新建文本文档',
          summary: null,
          publishDate: '2022-03-30 12:00:00',
          publishUrl: 'https://demo.zving.com/test/c/2022-03-30/508116.shtml',
          contentTypeID: 'File',
          listLogo: null,
          bodyText: null,
          imagesTotal: 0,
          videosTotal: 0,
          audiosTotal: 0,
          filesTotal: 1,
          extendJSON: JSON.stringify({
            path: 'upload/resources/file/2022/03/30/',
            fileName: '37600.txt',
            oldFileName: '新建文本文档.txt',
            fileSize: '2B',
            richTitle: '新建文本文档',
          }),
        },
      ],
    }, {
      baseUrl: 'https://demo.zving.com/zcmstest',
      currentSite: '277',
      zusid: 'test-zusid',
    })

    expect(page.total).toBe(2)
    expect(page.items[0]).toMatchObject({
      id: '511716',
      catalogId: '17680',
      title: '冰品市场“热”起来',
      contentTypeId: 'Article',
      previewAsset: {
        kind: 'image',
        relativePath: 'upload/resources/image/2025/06/30/38925_361x300.jpeg',
      },
    })
    expect(page.items[0]?.assets).toContainEqual(expect.objectContaining({
      kind: 'image',
      relativePath: 'upload/resources/image/2025/06/30/38925.jpeg',
    }))
    expect(page.items[1]).toMatchObject({
      id: '508116',
      catalogId: '17718',
      contentTypeId: 'File',
    })
    expect(page.items[1]?.assets).toEqual([expect.objectContaining({
      kind: 'file',
      relativePath: 'upload/resources/file/2022/03/30/37600.txt',
      filename: '新建文本文档.txt',
      sizeLabel: '2B',
    })])
  })
})
