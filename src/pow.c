#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#define ATTRIBUTE_EXPORT __attribute__ ((visibility ("default")))
#define ATTRIBUTE_OVERLOAD __attribute__((overloadable))
#define ATTRIBUTE_INLINE inline __attribute__((always_inline))

static void *malloc(size_t size);
static void free(void *p);

static ATTRIBUTE_INLINE uint32_t RGBA8ToUint32(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  return (
    ((r & 0xFFu) << 24u) +
    ((g & 0xFFu) << 16u) +
    ((b & 0xFFu) <<  8u) +
    ((a & 0xFFu) <<  0u)
  );
}

static const int32_t SIGMA82[192] = {
  0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,28,20,8,16,18,30,26,12,2,24,
  0,4,22,14,10,6,22,16,24,0,10,4,30,26,20,28,6,12,14,2,18,8,14,18,6,2,26,
  24,22,28,4,12,10,20,8,0,30,16,18,0,10,14,4,8,20,30,28,2,22,24,12,16,6,
  26,4,24,12,20,0,22,16,6,8,26,14,10,30,28,2,18,24,10,2,30,28,26,8,20,0,
  14,12,6,18,4,16,22,26,22,14,28,24,2,6,18,10,0,30,8,16,12,4,20,12,30,28,
  18,22,6,0,16,24,4,26,14,2,8,20,10,20,4,16,8,14,12,2,10,30,22,18,28,6,24,
  26,0,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,28,20,8,16,18,30,26,12,
  2,24,0,4,22,14,10,6
};

static uint32_t vb[32] = {
  0xF2BDC900u, 0x6A09E667u, 0x84CAA73Bu, 0xBB67AE85u,
  0xFE94F82Bu, 0x3C6EF372u, 0x5F1D36F1u, 0xA54FF53Au,
  0xADE682D1u, 0x510E527Fu, 0x2B3E6C1Fu, 0x9B05688Cu,
  0xFB41BD6Bu, 0x1F83D9ABu, 0x137E2179u, 0x5BE0CD19u,
  0xF3BCC908u, 0x6A09E667u, 0x84CAA73Bu, 0xBB67AE85u,
  0xFE94F82Bu, 0x3C6EF372u, 0x5F1D36F1u, 0xA54FF53Au,
  0xADE682F9u, 0x510E527Fu, 0x2B3E6C1Fu, 0x9B05688Cu,
  0x04BE4294u, 0xE07C2654u, 0x137E2179u, 0x5BE0CD19u,
};

static uint32_t v[32] = {};

static uint32_t m[32] = {0u};

void add3_uint64(int32_t a, uint32_t b0, uint32_t b1) {
  uint32_t o0 = v[a] + b0;
  uint32_t o1 = v[a + 1] + b1;
  if (v[a] > 0xFFFFFFFFu - b0) {
    o1++;
  }
  v[a] = o0;
  v[a + 1] = o1;
}

void add2_uint64(int32_t a, int32_t b) {
  add3_uint64(a, v[b], v[b+1]);
}

void B2B_G(int32_t a, int32_t b, int32_t c, int32_t d, int32_t ix, int32_t iy) {
  add2_uint64(a, b);
  add3_uint64(a, m[ix], m[ix + 1]);

  uint32_t xor0 = v[d] ^ v[a];
  uint32_t xor1 = v[d + 1] ^ v[a + 1];
  v[d] = xor1;
  v[d + 1] = xor0;

  add2_uint64(c, d);

  xor0 = v[b] ^ v[c];
  xor1 = v[b + 1] ^ v[c + 1];
  v[b] = (xor0 >> 24) ^ (xor1 << 8);
  v[b + 1] = (xor1 >> 24) ^ (xor0 << 8);

  add2_uint64(a, b);
  add3_uint64(a, m[iy], m[iy + 1]);

  xor0 = v[d] ^ v[a];
  xor1 = v[d + 1] ^ v[a + 1];
  v[d] = (xor0 >> 16) ^ (xor1 << 16);
  v[d + 1] = (xor1 >> 16) ^ (xor0 << 16);

  add2_uint64(c, d);

  xor0 = v[b] ^ v[c];
  xor1 = v[b + 1] ^ v[c + 1];
  v[b] = (xor1 >> 31) ^ (xor0 << 1);
  v[b + 1] = (xor0 >> 31) ^ (xor1 << 1);
}

ATTRIBUTE_EXPORT uint32_t Calculate(
  uint32_t uBlockOffsetX, uint32_t uBlockOffsetY,
  uint32_t uBlockSize,
  uint32_t uDifficulty,
  uint32_t uWork0r, uint32_t uWork0g, uint32_t uWork0b, uint32_t uWork0a,
  uint32_t uWork1r, uint32_t uWork1g, uint32_t uWork1b, uint32_t uWork1a,
  uint32_t uHash0r, uint32_t uHash0g, uint32_t uHash0b, uint32_t uHash0a,
  uint32_t uHash1r, uint32_t uHash1g, uint32_t uHash1b, uint32_t uHash1a
) {

  uint32_t uWork0[4] = {uWork0r, uWork0g, uWork0b, uWork0a};
  uint32_t uWork1[4] = {uWork1r, uWork1g, uWork1b, uWork1a};

  uint32_t uHash0[4] = {uHash0r, uHash0g, uHash0b, uHash0a};
  uint32_t uHash1[4] = {uHash1r, uHash1g, uHash1b, uHash1a};

  for (uint32_t yy = 0u; yy < uBlockSize; ++yy) {
    for (uint32_t xx = 0u; xx < uBlockSize; ++xx) {
      uint32_t uv_x = uBlockOffsetX + xx;
      uint32_t uv_y = uBlockOffsetY + yy;
      uint32_t x_pos = uv_x % uBlockSize;
      uint32_t y_pos = uv_y % uBlockSize;
      uint32_t x_index = (uv_x - x_pos) / uBlockSize;
      uint32_t y_index = (uv_y - y_pos) / uBlockSize;

      #pragma clang loop unroll(full)
      for (uint8_t ii = 0u; ii < 32u;++ii) {
        v[ii] = vb[ii];
      }

      m[0] = (x_pos ^ (y_pos << 8) ^ ((uWork0[2u] ^ x_index) << 16) ^ ((uWork0[3u] ^ y_index) << 24));
      m[1] = (uWork1[0u] ^ (uWork1[1u] << 8) ^ (uWork1[2u] << 16) ^ (uWork1[3u] << 24));

      m[2] = uHash0[0u];
      m[3] = uHash0[1u];
      m[4] = uHash0[2u];
      m[5] = uHash0[3u];
      m[6] = uHash1[0u];
      m[7] = uHash1[1u];
      m[8] = uHash1[2u];
      m[9] = uHash1[3u];

      #pragma clang loop unroll(full)
      for (int32_t ii = 0; ii < 12; ++ii) {
        B2B_G(0, 8, 16, 24,  SIGMA82[ii * 16 + 0],  SIGMA82[ii * 16 + 1]);
        B2B_G(2, 10, 18, 26, SIGMA82[ii * 16 + 2],  SIGMA82[ii * 16 + 3]);
        B2B_G(4, 12, 20, 28, SIGMA82[ii * 16 + 4],  SIGMA82[ii * 16 + 5]);
        B2B_G(6, 14, 22, 30, SIGMA82[ii * 16 + 6],  SIGMA82[ii * 16 + 7]);
        B2B_G(0, 10, 20, 30, SIGMA82[ii * 16 + 8],  SIGMA82[ii * 16 + 9]);
        B2B_G(2, 12, 22, 24, SIGMA82[ii * 16 + 10], SIGMA82[ii * 16 + 11]);
        B2B_G(4, 14, 16, 26, SIGMA82[ii * 16 + 12], SIGMA82[ii * 16 + 13]);
        B2B_G(6, 8, 18, 28,  SIGMA82[ii * 16 + 14], SIGMA82[ii * 16 + 15]);
      }

      if ((0x6A09E667u ^ v[1] ^ v[17]) > uDifficulty) {
        return RGBA8ToUint32(x_index + 1u, y_index + 1u, x_pos, y_pos);
      }

    }
  }

  return 0u;
}
