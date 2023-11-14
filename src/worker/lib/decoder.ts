import { pipe } from 'fp-ts/lib/function'

import { D } from '@/lib/fp'

const event = process.env.FC_CUSTOM_CONTAINER_EVENT
if (!event) {
  console.error('FC_CUSTOM_CONTAINER_EVENT is empty')
  process.exit(1)
}

export const imageParamsDecoder = pipe(
  D.struct({
    url: D.string,
    format: D.union(D.literal('jpg'), D.literal('webp'), D.literal('avif')),
  }),
  D.intersect(
    D.partial({
      w: D.number,
      h: D.number,
      q: D.number,
    }),
  ),
)

export const animationParamsDecoder = D.struct({
  url: D.string,
  format: D.union(D.literal('mp4'), D.literal('webm')),
})

export const eventDecoder = pipe(
  D.struct({
    cacheKey: D.string,
  }),
  D.intersect(
    D.union(
      D.struct({
        type: D.literal('image'),
        params: imageParamsDecoder,
      }),
      D.struct({
        type: D.literal('animation'),
        params: animationParamsDecoder,
      }),
    ),
  ),
)
