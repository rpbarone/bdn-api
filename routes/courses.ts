import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import Course, { ICourse } from '../models/Course';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetCoursesQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  title?: string;
  isActive?: boolean;
  isInitial?: boolean;
  minDuration?: number;
  maxDuration?: number;
  minConclusions?: number;
  maxConclusions?: number;
  hasQuiz?: boolean;
  lessonType?: 'video' | 'doc';
  createdFrom?: string;
  createdTo?: string;
}

interface GetCourseParams {
  id: string;
}

interface CreateCourseBody {
  title: string;
  description?: string;
  coverPictureUrl?: string;
  isActive?: boolean;
  isInitial?: boolean;
  lessons: Array<{
    title: string;
    description?: string;
    mediaUrl?: string;
    type: 'video' | 'doc';
    durationSeconds?: number;
    order: number;
    slug?: string;
  }>;
  quiz?: {
    id?: string;
    timeLimit?: number;
    maxPoints?: number;
    questions?: Array<{
      content: string;
      imageUrl?: string;
      options: Array<{
        answer: string;
        isCorrect: boolean;
      }>;
    }>;
  };
}

interface UpdateCourseBody extends Partial<CreateCourseBody> {}

export default async function courseRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/courses/stats
   * Retorna estatísticas sobre cursos (apenas para admin+)
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Courses'],
        summary: 'Obter estatísticas de cursos',
        description: 'Endpoint exclusivo para admin+ obter estatísticas sobre cursos'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin ou super_admin
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode acessar estas estatísticas', 403);
      }

      // Executar queries agregadas
      const [
        totalCourses,
        activeCourses,
        coursesWithQuiz,
        totalLessons
      ] = await Promise.all([
        // Total de cursos
        Course.countDocuments(),
        
        // Cursos ativos
        Course.countDocuments({ isActive: true }),
        
        // Cursos com quiz
        Course.countDocuments({ 'quiz.questions': { $exists: true, $ne: [] } }),
        
        // Total de aulas
        Course.aggregate([
          { $unwind: '$lessons' },
          { $group: { 
            _id: null, 
            total: { $sum: 1 } 
          }}
        ])
      ]);

      const statistics = {
        totalCursos: totalCourses,
        cursosAtivos: activeCourses,
        totalAulas: totalLessons[0]?.total || 0,
        cursosComQuiz: coursesWithQuiz
      };

      return customReply.sucesso(statistics, 'Estatísticas de cursos obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/courses
   * Lista todos os cursos com paginação e filtros
   */
  fastify.get<{ Querystring: GetCoursesQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Course')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          title: { type: 'string' },
          isActive: { type: 'boolean' },
          isInitial: { type: 'boolean' },
          minDuration: { type: 'number' },
          maxDuration: { type: 'number' },
          minConclusions: { type: 'number' },
          maxConclusions: { type: 'number' },
          hasQuiz: { type: 'boolean' },
          lessonType: { type: 'string', enum: ['video', 'doc'] },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetCoursesQuery }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        ...filters
      } = request.query;

      // Construir query
      const query: any = {};

      // Busca por título ou descrição
      if (filters.title) {
        const searchTerm = filters.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        query.$or = [
          { titleNormalized: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: filters.title, $options: 'i' } }
        ];
      }

      // Filtro de status (Todos, Ativos, Inativos)
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      if (filters.isInitial !== undefined) query.isInitial = filters.isInitial;

      // Filtros de range numérico
      if (filters.minDuration !== undefined || filters.maxDuration !== undefined) {
        query.durationSeconds = {};
        if (filters.minDuration !== undefined) query.durationSeconds.$gte = filters.minDuration;
        if (filters.maxDuration !== undefined) query.durationSeconds.$lte = filters.maxDuration;
      }
      if (filters.minConclusions !== undefined || filters.maxConclusions !== undefined) {
        query.conclusions = {};
        if (filters.minConclusions !== undefined) query.conclusions.$gte = filters.minConclusions;
        if (filters.maxConclusions !== undefined) query.conclusions.$lte = filters.maxConclusions;
      }

      // Filtro de quiz
      if (filters.hasQuiz !== undefined) {
        if (filters.hasQuiz) {
          query['quiz.questions'] = { $exists: true, $ne: [] };
        } else {
          query.$or = [
            { 'quiz.questions': { $exists: false } },
            { 'quiz.questions': { $eq: [] } }
          ];
        }
      }

      // Filtro de tipo de lição
      if (filters.lessonType) {
        query['lessons.type'] = filters.lessonType;
      }

      // Filtro de período de criação
      if (filters.createdFrom || filters.createdTo) {
        query.createdAt = {};
        if (filters.createdFrom) {
          query.createdAt.$gte = new Date(filters.createdFrom);
        }
        if (filters.createdTo) {
          const endDate = new Date(filters.createdTo);
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      // Se usuário é influencer, força ver apenas cursos ativos
      if (request.user!.role === 'influencer') {
        query.isActive = true;
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query com agregação para incluir campos calculados
      const pipeline: any[] = [
        { $match: query },
        { 
          $addFields: {
            totalAulas: { $size: '$lessons' },
            duracaoTotal: { $sum: '$lessons.durationSeconds' },
            // Nota: Não temos conclusões por aula no modelo atual, apenas conclusões totais do curso
            totalConclusoes: '$conclusions'
          }
        },
        { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const [courses, totalCount] = await Promise.all([
        Course.aggregate(pipeline),
        Course.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredCourses = request.permissionFilter ? courses.map(request.permissionFilter) : courses;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredCourses,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages,
          hasNext,
          hasPrev
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar cursos', 500);
    }
  });

  /**
   * GET /api/courses/:id
   * Busca um curso específico
   */
  fastify.get<{ Params: GetCourseParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Course')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCourseParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar agregação para incluir campos calculados
      const courses = await Course.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(request.params.id) } },
        { 
          $addFields: {
            totalAulas: { $size: '$lessons' },
            duracaoTotal: { $sum: '$lessons.durationSeconds' },
            totalConclusoes: '$conclusions'
          }
        }
      ]);

      const course = courses[0];
      
      if (!course) {
        return customReply.erro('Curso não encontrado', 404);
      }

      // Se for influencer e curso inativo, negar acesso
      if (request.user!.role === 'influencer' && !course.isActive) {
        return customReply.erro('Curso não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCourse = request.permissionFilter ? request.permissionFilter(course) : course;

      return customReply.sucesso(filteredCourse);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar curso', 500);
    }
  });

  /**
   * POST /api/courses
   * Cria um novo curso
   */
  fastify.post<{ Body: CreateCourseBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Course'), aplicarHooks('Course', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['title', 'lessons'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          coverPictureUrl: { type: 'string' },
          isActive: { type: 'boolean' },
          isInitial: { type: 'boolean' },
          lessons: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['title', 'type', 'order'],
              properties: {
                title: { type: 'string', minLength: 3, maxLength: 200 },
                description: { type: 'string', maxLength: 500 },
                mediaUrl: { type: 'string' },
                type: { type: 'string', enum: ['video', 'doc'] },
                durationSeconds: { type: 'number', minimum: 0 },
                order: { type: 'number', minimum: 1 },
                slug: { type: 'string' }
              }
            }
          },
          quiz: {
            type: 'object',
            properties: {
              id: { type: 'string', pattern: '^QZ\\d{4,}$' },
              timeLimit: { type: 'number', minimum: 0 },
              maxPoints: { type: 'number', minimum: 0 },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['content', 'options'],
                  properties: {
                    content: { type: 'string', minLength: 5 },
                    imageUrl: { type: 'string' },
                    options: {
                      type: 'array',
                      minItems: 2,
                      items: {
                        type: 'object',
                        required: ['answer', 'isCorrect'],
                        properties: {
                          answer: { type: 'string', minLength: 1 },
                          isCorrect: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateCourseBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const courseData = {
        ...(hookCtx?.data || request.body),
        createdBy: request.user!._id,
        updatedBy: request.user!._id
      };

      // Criar curso
      const course = new Course(courseData);
      await course.save();

      // Buscar curso criado para retornar com virtuals
      const createdCourse = await Course.findById(course._id).lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdCourse);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCourse = request.permissionFilter ? request.permissionFilter(createdCourse) : createdCourse;

      return customReply.sucesso(filteredCourse, 'Curso criado com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      // Erro de duplicação
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return customReply.erro(`${field} já está em uso`, 409);
      }
      
      return customReply.erro('Erro ao criar curso', 500);
    }
  });

  /**
   * PUT /api/courses/:id
   * Atualiza um curso
   */
  fastify.put<{ Params: GetCourseParams; Body: UpdateCourseBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Course'), aplicarHooks('Course', 'update')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          coverPictureUrl: { type: 'string' },
          isActive: { type: 'boolean' },
          isInitial: { type: 'boolean' },
          lessons: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['title', 'type', 'order'],
              properties: {
                title: { type: 'string', minLength: 3, maxLength: 200 },
                description: { type: 'string', maxLength: 500 },
                mediaUrl: { type: 'string' },
                type: { type: 'string', enum: ['video', 'doc'] },
                durationSeconds: { type: 'number', minimum: 0 },
                order: { type: 'number', minimum: 1 },
                slug: { type: 'string' }
              }
            }
          },
          quiz: {
            type: 'object',
            properties: {
              id: { type: 'string', pattern: '^QZ\\d{4,}$' },
              timeLimit: { type: 'number', minimum: 0 },
              maxPoints: { type: 'number', minimum: 0 },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['content', 'options'],
                  properties: {
                    content: { type: 'string', minLength: 5 },
                    imageUrl: { type: 'string' },
                    options: {
                      type: 'array',
                      minItems: 2,
                      items: {
                        type: 'object',
                        required: ['answer', 'isCorrect'],
                        properties: {
                          answer: { type: 'string', minLength: 1 },
                          isCorrect: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCourseParams; Body: UpdateCourseBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Atualizar curso
      const course = await Course.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      ).lean();

      if (!course) {
        return customReply.erro('Curso não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(course);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCourse = request.permissionFilter ? request.permissionFilter(course) : course;

      return customReply.sucesso(filteredCourse, 'Curso atualizado com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      // Erro de duplicação
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return customReply.erro(`${field} já está em uso`, 409);
      }
      
      return customReply.erro('Erro ao atualizar curso', 500);
    }
  });

  /**
   * DELETE /api/courses/:id
   * Remove um curso
   */
  fastify.delete<{ Params: GetCourseParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Course'), aplicarHooks('Course', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCourseParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const course = await Course.findByIdAndDelete(request.params.id);
      
      if (!course) {
        return customReply.erro('Curso não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(course);
      }

      return customReply.sucesso(null, 'Curso removido com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover curso', 500);
    }
  });
}
