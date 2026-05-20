import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/create-entity
 * Server-side creation using Firebase Admin SDK (bypasses Firestore rules).
 * Used when client-side Firestore rules block the operation.
 * Validates auth + tenant membership before writing.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json();
    const { type, data, tenantId } = body;

    if (!type) {
      return NextResponse.json({ error: 'Falta type' }, { status: 400 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Se requiere tenantId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify tenant exists and user is a member
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Espacio de trabajo no encontrado' }, { status: 404 });
    }
    const tenantData = tenantDoc.data()!;
    const members: string[] = tenantData.members || [];
    const superAdmins: string[] = tenantData.superAdmins || [];
    const isTenantMember = members.includes(uid) || tenantData.createdBy === uid || superAdmins.includes(uid);
    if (!isTenantMember) {
      return NextResponse.json({ error: 'No eres miembro de este espacio de trabajo' }, { status: 403 });
    }

    const now = new Date().toISOString();

    // ─── CREATE PROJECT ───
    if (type === 'project') {
      if (!data?.name?.trim()) {
        return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
      }

      const projData: Record<string, any> = {
        name: data.name.trim(),
        status: data.status || 'Concepto',
        client: data.client || '',
        location: data.location || '',
        budget: Number(data.budget) || 0,
        description: data.description || '',
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        companyId: data.companyId || '',
        projectType: data.projectType || 'Ejecución',
        progress: 0,
        tenantId,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        updatedBy: uid,
      };

      // Remove undefined values
      Object.keys(projData).forEach(k => projData[k] === undefined && delete projData[k]);

      const ref = await db.collection('projects').add(projData);

      // Initialize work phases based on project type
      const PROJECT_TYPE_PHASES: Record<string, { key: string; name: string; description: string }[]> = {
        'Diseño': [
          { key: 'anteproyecto', name: 'Anteproyecto', description: 'Propuesta inicial del diseño' },
          { key: 'diseno-desarrollo', name: 'Desarrollo de Diseño', description: 'Desarrollo del diseño hasta plano final' },
          { key: 'diseno-aprobacion', name: 'Aprobación', description: 'Revisión y aprobación del diseño' },
          { key: 'diseno-entrega', name: 'Entrega', description: 'Entrega final de documentos de diseño' },
        ],
        'Ejecución': [
          { key: 'preparacion', name: 'Preparación', description: 'Preparación del sitio y movilización' },
          { key: 'cimentacion', name: 'Cimentación', description: 'Obras de cimentación' },
          { key: 'estructura', name: 'Estructura', description: 'Estructura del proyecto' },
          { key: 'instalaciones', name: 'Instalaciones', description: 'Instalaciones técnicas' },
          { key: 'acabados', name: 'Acabados', description: 'Acabados finales' },
          { key: 'entrega', name: 'Entrega', description: 'Entrega del proyecto' },
        ],
      };

      const projType = data.projectType || 'Ejecución';
      const types = projType === 'Ambos' ? ['Diseño', 'Ejecución'] : [projType];
      const enabledPhases: string[] = data.enabledPhases || [];
      const batch = db.batch();
      let order = 0;

      for (const t of types) {
        const templates = PROJECT_TYPE_PHASES[t] || [];
        for (const tpl of templates) {
          const isEnabled = enabledPhases.length === 0 || enabledPhases.includes(tpl.key);
          const phaseRef = db.collection('projects').doc(ref.id).collection('workPhases').doc();
          batch.set(phaseRef, {
            name: tpl.name,
            description: tpl.description,
            status: 'Pendiente',
            order,
            startDate: '',
            endDate: '',
            createdAt: now,
            tenantId,
            type: t,
            enabled: isEnabled,
            phaseKey: tpl.key,
          });
          order++;
        }
      }
      await batch.commit();

      return NextResponse.json({ success: true, id: ref.id }, { status: 201 });
    }

    // ─── CREATE TASK ───
    if (type === 'task') {
      if (!data?.title?.trim()) {
        return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
      }

      const taskData: Record<string, any> = {
        title: data.title.trim(),
        description: data.description || '',
        projectId: data.projectId || '',
        assigneeId: data.assigneeId || '',
        assigneeIds: data.assigneeIds || [],
        priority: data.priority || 'Media',
        status: data.status || 'Por hacer',
        dueDate: data.dueDate || '',
        tags: data.tags || [],
        tenantId,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        updatedBy: uid,
      };
      if (data.subtasks?.length) taskData.subtasks = data.subtasks;
      if (data.agendaMeta) taskData.agendaMeta = data.agendaMeta;
      if (data.phaseId) taskData.phaseId = data.phaseId;

      Object.keys(taskData).forEach(k => taskData[k] === undefined && delete taskData[k]);

      const ref = await db.collection('tasks').add(taskData);
      return NextResponse.json({ success: true, id: ref.id }, { status: 201 });
    }

    return NextResponse.json({ error: `Tipo no soportado: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error('[Archii] create-entity error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
