const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

/**
 * Gera um código de cupom único
 * @param prefix Prefixo do código (ORG para orgânico, TP para tráfego pago)
 * @param userId ID do usuário para garantir unicidade
 */
async function generateCouponCode(prefix, userId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const userPart = userId.substring(userId.length - 4).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `${prefix}${userPart}${timestamp}${randomPart}`;
}

/**
 * Cria cupons para o usuário
 */
async function createUserCoupons(userId, userName) {
  const Coupon = mongoose.model('Coupon');
  
  // Gerar códigos únicos
  const organicCode = await generateCouponCode('ORG', userId);
  const trafficPaidCode = await generateCouponCode('TP', userId);
  
  // Configurações padrão dos cupons
  const defaultCouponData = {
    associatedInfluencer: userId,
    description: `Cupom de desconto - ${userName}`,
    maxUses: 1000,
    currentUses: 0,
    minimumOrderValue: 0,
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
    discountType: 'percentual',
    discountValue: 10, // 10% de desconto
    minItemQuantity: 1,
    freeShipping: false,
    oneTimePerUser: true,
    isActive: true
  };
  
  // Criar cupom orgânico
  await Coupon.create({
    ...defaultCouponData,
    origin: 'organic',
    code: organicCode
  });
  
  // Criar cupom tráfego pago
  await Coupon.create({
    ...defaultCouponData,
    origin: 'trafficPaid',
    code: trafficPaidCode
  });
  
  return { organicCode, trafficPaidCode };
}

const UserHooks = {
  // Hooks antes de criar
  beforeCreate: [
    {
      name: 'normalizeNameBeforeCreate',
      run: async (ctx) => {
        if (ctx.data?.name) {
          ctx.data.normalizedName = ctx.data.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        }
      }
    },
    {
      name: 'hashPasswordBeforeCreate',
      run: async (ctx) => {
        if (ctx.data?.password) {
          const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
          ctx.data.password = await bcrypt.hash(ctx.data.password, rounds);
        }
      }
    }
  ],

  // Hooks antes de atualizar
  beforeUpdate: [
    {
      name: 'normalizeNameBeforeUpdate',
      run: async (ctx) => {
        if (ctx.data?.name) {
          ctx.data.normalizedName = ctx.data.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        }
      }
    },
    {
      name: 'hashPasswordBeforeUpdate',
      condition: 'data.password', // Só executa se senha for fornecida
      run: async (ctx) => {
        if (ctx.data?.password) {
          const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
          ctx.data.password = await bcrypt.hash(ctx.data.password, rounds);
        }
      }
    }
  ],

  // Hook após criar usuário para gerar cupons
  afterCreate: {
    name: 'createUserCoupons',
    run: async (ctx) => {
      if (ctx.result?._id && ctx.result?.name) {
        try {
          const coupons = await createUserCoupons(
            ctx.result._id.toString(),
            ctx.result.name
          );
          
          // Atualizar usuário com os códigos dos cupons
          await ctx.Model.findByIdAndUpdate(ctx.result._id, {
            coupons: {
              organicCode: coupons.organicCode,
              trafficPaidCode: coupons.trafficPaidCode
            }
          });
          
          // Atualizar o resultado para incluir os cupons
          if (ctx.result) {
            ctx.result.coupons = coupons;
          }
          
          console.log(`✅ Cupons criados para usuário ${ctx.result.name}: ${coupons.organicCode}, ${coupons.trafficPaidCode}`);
        } catch (error) {
          console.error(`❌ Erro ao criar cupons para usuário ${ctx.result._id}:`, error);
          // Não propagar o erro para não impedir a criação do usuário
        }
      }
    }
  },

  // Hook de erro para log
  onError: {
    name: 'logUserError',
    run: async (ctx) => {
      console.error(`❌ Erro em operação ${ctx.operation} de User:`, ctx.error);
    }
  }
};

module.exports = UserHooks;
