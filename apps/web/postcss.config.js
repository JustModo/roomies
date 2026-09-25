import cascadeLayers from '@csstools/postcss-cascade-layers';

export default (ctx) => ({
  plugins: ctx.env === 'production' ? [cascadeLayers()] : [],
});
