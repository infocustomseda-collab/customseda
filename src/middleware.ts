import { defineMiddleware } from 'astro:middleware';
import { catalogWriteMiddleware } from './lib/cms/write-middleware.ts';
export const onRequest=defineMiddleware(catalogWriteMiddleware);
