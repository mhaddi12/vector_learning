export default defineNuxtConfig({
  compatibilityDate: "2026-10-05",
  css: ["~/assets/styles.css"],
  devServer: {
    port: 3000,
  },
  nitro: {
    externals: {
      external: ["@prisma/client", ".prisma/client"],
    },
  },
});

