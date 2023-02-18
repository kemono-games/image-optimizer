# Image Optimizer

Demo: https://kemono.games

It provides an API to receive these parameters：

1. URL of image
2. Target width
3. Target height (optional)
4. quality (optional, default is 75)

With this API, we can easily create something like this:

```html
<img
  sizes="(min-width: 62em) 340px, (min-width: 48em) 240px, (min-width: 30em) 720px, 720px"
  srcset="https://image-optimizer.example.com/image?url={url_of_original_image}&w=16&q=75 16w,
      https://image-optimizer.example.com/image?url={url_of_original_image}&w=32&q=75 32w,
      https://image-optimizer.example.com/image?url={url_of_original_image}&w=48&q=75 48w,
      ...
      https://image-optimizer.example.com/image?url={url_of_original_image}&w=3840&q=75 3840w"
  decoding="async"
/>
```

Then the browser will automatically select the most suitable image according to the current viewport size.

Image Optimizer also determines which image types are supported by the user's browser based on the `Accept` header sent by the user.

For example `Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8` means user’s browser support `webp` , in that case Image Optimizer will return `webp` format image which is much smaller.

> `avif` is also supported and offers a higher compression ratio than `webp`, but at the cost of a long compression time (about 1~2s), which is unacceptable at the first user visit. So I decided to turn it off at this time. My plan is to design a queue. When a user visits an image for the first time, the `webp` version will be served first (if the user supports it), then a task will be added to the queue to create an `avif` version of the image when the server is free.  When another user visits, a more compressed `avif` image will be served directly from the cache.
> 

And for the delay of the first visit (about 100ms ~ 500ms depends on the original image’s size and the performance of the server), we can create preload tag for the image so that the browser will start trying to load the image very early on. This will offset the delay of the first visit.

Like this:

```html
<link
  rel="preload"
  as="image"
  imageSizes="(min-width: 62em) 340px, (min-width: 48em) 240px, (min-width: 30em) 720px, 720px"
  imageSrcSet="https://image-optimizer.example.com/image?url={url_of_original_image}&w=16&q=75 16w,
    https://image-optimizer.example.com/image?url={url_of_original_image}&w=32&q=75 32w,
    https://image-optimizer.example.com/image?url={url_of_original_image}&w=48&q=75 48w,
    ...
    https://image-optimizer.example.com/image?url={url_of_original_image}&w=3840&q=75 3840w"
/>
```

This way content creators don't have to worry about the size of the images while providing the user with an optimal experience (reduce LCP etc.).

**Con: Must use CDN which support custom cache key. The `Accept` header must be added to the cache key in order to work properly. This will also affect the hit rate of the Edge Cache. For example, CloudFront.**

# Usage

## For images:

Endpoint: `/image`

Query:

```
url: Image url
w: Output width
h: Output height (optional)
format: jpg | png | webp
```

## For animations:

Endpoint: `/animation`

Query:

```
url: Animated image url
format: mp4 | webm
```
