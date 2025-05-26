const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { SECURITY_CONFIG } = require('../utils/constants');

// Importar o modelo Coupon
require('../models/Coupon');

// Importar modelos diretamente
const Counter = require('../models/Counter').default;
// const Coupon = require('../models/Coupon').default; // Temporariamente comentado

/**
 * Gera um ID amigável para o usuário usando o Counter
 * @param role Role do usuário (influencer, admin, super_admin)
 */
async function generateUserId(role) {
  const prefix = (role === 'influencer') ? 'INF' : 'ADM';
  const collectionName = `user_${prefix.toLowerCase()}`;
  
  // Usar findOneAndUpdate para garantir atomicidade
  const counter = await Counter.findOneAndUpdate(
    { collectionName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  
  return `${prefix}${counter.seq.toString().padStart(4, '0')}`;
}

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
async function createUserCoupons(userId, userName, userRole) {
  // Não criar cupons para admin e super_admin
  if (userRole === 'admin' || userRole === 'super_admin') {
    console.log(`🔄 Pulando criação de cupons para ${userRole}: ${userName}`);
    return null;
  }
  
  try {
    const Coupon = mongoose.model('Coupon');
    console.log('📋 Modelo Coupon carregado');
    
    const organicCode = await generateCouponCode('ORG', userId);
    const trafficPaidCode = await generateCouponCode('TP', userId);
    
    console.log(`🎟️  Códigos gerados: ${organicCode}, ${trafficPaidCode}`);
    
    // Configurações padrão dos cupons
    const defaultCouponData = {
      associatedInfluencer: userId,
      description: `Cupom de desconto - ${userName}`,
      // Sem limite de uso - não definir maxUses
      currentUses: 0,
      minimumOrderValue: 0,
      startDate: new Date(),
      endDate: new Date('2099-12-31'), // Data muito distante
      discountType: 'percentual',
      discountValue: 10, // 10% de desconto
      minItemQuantity: 1,
      freeShipping: false,
      oneTimePerUser: false, // Pode ser usado múltiplas vezes pelo mesmo usuário
      isActive: true
    };
    
    // Criar cupom orgânico
    const couponOrganic = await Coupon.create({
      ...defaultCouponData,
      origin: 'organic',
      code: organicCode
    });
    console.log(`✅ Cupom orgânico criado: ${couponOrganic.code}`);
    
    // Criar cupom tráfego pago
    const couponTraffic = await Coupon.create({
      ...defaultCouponData,
      origin: 'trafficPaid',
      code: trafficPaidCode
    });
    console.log(`✅ Cupom tráfego pago criado: ${couponTraffic.code}`);
    
    return { organicCode, trafficPaidCode };
  } catch (error) {
    console.error(`❌ Erro ao criar cupons: ${error.message}`);
    console.error('Stack:', error.stack);
    // PROPAGAR o erro para impedir a criação do usuário
    throw new Error(`Falha ao criar cupons: ${error.message}`);
  }
}

const UserHooks = {
  // Hooks antes de criar
  beforeCreate: [
    {
      name: 'generateUserIdBeforeCreate',
      run: async (ctx) => {
        // Garantir que role tenha um valor padrão
        if (!ctx.data?.role) {
          ctx.data.role = 'influencer';
        }
        
        if (!ctx.data?.id) {
          ctx.data.id = await generateUserId(ctx.data.role);
          console.log(`✅ ID gerado: ${ctx.data.id}`);
        }
      }
    },
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
          const rounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
          ctx.data.password = await bcrypt.hash(ctx.data.password, rounds);
        }
      }
    },
    {
      name: 'enforce2FAForAdmins',
      run: async (ctx) => {
        // Para admin e super_admin, 2FA deve ser obrigatório
        if (ctx.data?.role === 'admin' || ctx.data?.role === 'super_admin') {
          // Marcar que 2FA é obrigatório
          ctx.data.twoFactorRequired = true;
          console.log(`🔐 2FA marcado como obrigatório para ${ctx.data.role}: ${ctx.data.name}`);
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
          const rounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
          ctx.data.password = await bcrypt.hash(ctx.data.password, rounds);
        }
      }
    },
    {
      name: 'enforce2FAForAdminsOnUpdate',
      condition: 'data.role', // Só executa se role for alterado
      run: async (ctx) => {
        // Se está mudando para admin ou super_admin, marcar 2FA como obrigatório
        if (ctx.data?.role === 'admin' || ctx.data?.role === 'super_admin') {
          ctx.data.twoFactorRequired = true;
          console.log(`🔐 2FA marcado como obrigatório após mudança de role para ${ctx.data.role}`);
        }
      }
    },
    {
      name: 'manageCouponsOnStatusChange',
      condition: 'data.status', // Só executa se status for alterado
      run: async (ctx) => {
        // Verificar se o status está mudando
        if (ctx.data?.status && ctx.target && ctx.data.status !== ctx.target.status) {
          console.log(`📊 Status mudando de ${ctx.target.status} para ${ctx.data.status}`);
          
          // Se usuário é influencer, gerenciar cupons
          if (ctx.target.role === 'influencer' && ctx.target.coupons) {
            try {
              const Coupon = mongoose.model('Coupon');
              const newStatus = ctx.data.status === 'ativo';
              
              // Atualizar status dos cupons
              const result = await Coupon.updateMany(
                {
                  code: { 
                    $in: [
                      ctx.target.coupons.organicCode, 
                      ctx.target.coupons.trafficPaidCode
                    ].filter(Boolean) // Filtrar valores undefined/null
                  }
                },
                { isActive: newStatus }
              );
              
              console.log(`${newStatus ? '✅' : '🚫'} Cupons ${newStatus ? 'ativados' : 'desativados'}: ${result.modifiedCount} cupons atualizados`);
            } catch (error) {
              console.error('❌ Erro ao atualizar status dos cupons:', error);
              // Não propagar erro para não impedir atualização do usuário
            }
          }
        }
      }
    }
  ],

  // Hook após criar usuário para gerar cupons
  afterCreate: {
    name: 'createUserCoupons',
    run: async (ctx) => {
      if (ctx.result?._id && ctx.result?.name && ctx.result?.role) {
        const coupons = await createUserCoupons(
          ctx.result._id.toString(),
          ctx.result.name,
          ctx.result.role
        );
        
        // Só atualizar se cupons foram criados
        if (coupons) {
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
