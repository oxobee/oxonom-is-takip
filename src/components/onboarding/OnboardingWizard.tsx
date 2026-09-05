'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, X, Sparkles, FolderPlus, LayoutDashboard,
  Users, Bot, Rocket, CheckCircle2, Crown, Building2, MessageCircle,
  ClipboardCheck, Camera, DollarSign, Zap
} from 'lucide-react';
import { useOnboardingStore, type OnboardingStep } from '@/stores/onboarding-store';
import { useMotionPreference } from '@/hooks/useMotionPreference';

/* ─── Step Configuration ─── */
const STEPS: { id: OnboardingStep; title: string; subtitle: string; Icon: any; features: string[] }[] = [
  {
    id: 'welcome',
    title: "oxonom iş takip'e Hoş Geldiniz",
    subtitle: 'Proje, şantiye ve iş takip yönetim platformunuz',
    Icon: Crown,
    features: [
      'Kapsamlı proje ve şantiye yönetimi',
      'Görevleri otomatikleştiren yapay zeka asistanı',
      'Ekibinizle gerçek zamanlı iş birliği',
      'Bütçe, harcama ve envanter kontrolü',
      'RFI, onay belgeleri ve kusur listesi takibi',
    ],
  },
  {
    id: 'create-project',
    title: 'İlk Projenizi Oluşturun',
    subtitle: 'Şantiye ve işlerinizi net bir yapıyla organize edin',
    Icon: FolderPlus,
    features: [
      'Proje adı, müşteri ve konumu tanımlayın',
      'Çalışma aşamalarını ve zaman çizelgelerini belirleyin',
      'Kategori bazında bütçeler atayın',
      'Planları ve referans belgelerini yükleyin',
      'Ekibiniz için bildirimleri yapılandırın',
    ],
  },
  {
    id: 'explore-dashboard',
    title: 'Yönetim Panelini Keşfedin',
    subtitle: 'Tüm projeleriniz ve işleriniz üzerinde tam görünürlük sağlayın',
    Icon: LayoutDashboard,
    features: [
      'Aktif projelerinizin anlık KPI göstergeleri',
      'Bekleyen görevler ve genel ilerleme görünümü',
      'Gerçekleşen bütçe ve planlanan maliyet kontrolü',
      'İş ilerlemesine ait fotoğraf galerisi',
      'Tüm kilit bölümlere hızlı erişim',
    ],
  },
  {
    id: 'invite-team',
    title: 'Ekibinizi Davet Edin',
    subtitle: 'Projedeki tüm paydaşlarla birlikte çalışın',
    Icon: Users,
    features: [
      'Çalışma alanı davet kodunuzu paylaşın',
      'Roller: Süper Yönetici ve Ekip Üyeleri',
      'Proje bazlı entegre mesajlaşma',
      'Takip edilebilir görev atamaları',
      'Gerçek zamanlı anlık bildirimler',
    ],
  },
  {
    id: 'try-ai',
    title: 'Oxonom Asistanı Keşfedin',
    subtitle: 'Yapay zeka gücüyle üretkenliğinizi artırın',
    Icon: Bot,
    features: [
      'Doğal dil ile görev ve projeler oluşturun',
      'Bütçeleri analiz edin ve tutarsızlıkları tespit edin',
      'Projelerinizle ilgili soruları anında yanıtlar',
      'Otomatik raporlar oluşturun',
      'Verilerinize dayalı akıllı öneriler alın',
    ],
  },
];

/* ─── Step Icons for mini-nav ─── */
const STEP_ICONS: Record<OnboardingStep, any> = {
  welcome: Crown,
  'create-project': FolderPlus,
  'explore-dashboard': LayoutDashboard,
  'invite-team': Users,
  'try-ai': Bot,
  complete: Rocket,
};

const STEP_ORDER: OnboardingStep[] = ['welcome', 'create-project', 'explore-dashboard', 'invite-team', 'try-ai'];

/* ─── Animations ─── */
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 30 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  exit: { opacity: 0, scale: 0.95, y: -20, transition: { duration: 0.2 } },
};

export default function OnboardingWizard() {
  const { wizardActive, currentStep, nextStep, skipWizard } = useOnboardingStore();
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const reduced = useMotionPreference();
  const instant = { duration: 0 };

  const currentIdx = STEP_ORDER.indexOf(currentStep as OnboardingStep);
  const step = STEPS[currentIdx];
  const isLast = currentIdx === STEP_ORDER.length - 1;
  const isFirst = currentIdx === 0;
  const progress = ((currentIdx + 1) / STEP_ORDER.length) * 100;

  const handleNext = useCallback(() => {
    setDirection(1);
    nextStep();
  }, [nextStep]);

  const handleSkip = useCallback(() => {
    skipWizard();
  }, [skipWizard]);

  if (!wizardActive) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        variants={overlayVariants}
        initial={reduced ? false : "hidden"}
        animate="visible"
        exit={reduced ? { opacity: 0 } : "exit"}
        transition={reduced ? instant : undefined}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

        {/* Decorative elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[var(--af-accent)]/5 blur-[100px] animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[var(--af-accent2)]/5 blur-[80px] animate-float" style={{ animationDelay: '1.5s' }} />
        </div>

        {/* Content Card */}
        <div className="relative z-10 w-full max-w-lg mx-4">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={cardVariants}
              initial={reduced ? false : "hidden"}
              animate="visible"
              exit={reduced ? { opacity: 0 } : "exit"}
              transition={reduced ? instant : undefined}
              className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Progress bar */}
              <div className="h-1 bg-[var(--af-bg4)]">
                <motion.div
                  className="h-full bg-gradient-to-r from-[var(--af-accent)] to-[var(--af-accent2)] rounded-r-full"
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={reduced ? instant : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {/* Skip button */}
              <div className="flex justify-end p-3 pb-0">
                <button
                  onClick={handleSkip}
                  className="text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer bg-transparent border-none px-2 py-1 rounded-lg hover:bg-[var(--af-bg3)]"
                >
                  Turu Atla
                </button>
              </div>

              {/* Main content */}
              <div className="px-8 pb-4 pt-2">
                {/* Icon */}
                <motion.div
                  className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--af-accent)]/15 to-[var(--af-accent2)]/8 border border-[var(--af-accent)]/20 flex items-center justify-center"
                  animate={reduced ? {} : { y: [0, -4, 0] }}
                  transition={reduced ? instant : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <step.Icon size={36} className="stroke-[var(--af-accent)]" strokeWidth={1.5} />
                </motion.div>

                {/* Title */}
                <h2
                  className="text-2xl font-bold text-center mb-2"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {step.title}
                </h2>
                <p className="text-center text-[14px] text-[var(--muted-foreground)] mb-6">
                  {step.subtitle}
                </p>

                {/* Features list */}
                <div className="space-y-2.5 mb-8">
                  {step.features.map((feat, i) => {
                    const icons = [Zap, Building2, MessageCircle, ClipboardCheck, Camera, DollarSign, Bot, Users];
                    const FeatureIcon = icons[i % icons.length];
                    return (
                      <motion.div
                        key={i}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--af-bg3)]/50 hover:bg-[var(--af-bg3)] transition-colors"
                        initial={reduced ? false : { opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={reduced ? instant : { delay: i * 0.07, duration: 0.3 }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0">
                          <FeatureIcon size={14} className="stroke-[var(--af-accent)]" />
                        </div>
                        <span className="text-[13px] text-[var(--foreground)]">{feat}</span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Step dots */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  {STEP_ORDER.map((s, i) => {
                    const StepIcon = STEP_ICONS[s];
                    const isActive = i === currentIdx;
                    const isCompleted = i < currentIdx;
                    return (
                      <div
                        key={s}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[var(--af-accent)] text-background shadow-sm scale-110'
                            : isCompleted
                            ? 'bg-[var(--af-accent)]/15 text-[var(--af-accent)]'
                            : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={16} aria-hidden="true"/>
                        ) : (
                          <StepIcon size={14} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  {!isFirst && (
                    <button
                      aria-label="Önceki adım"
                      onClick={() => {
                        setDirection(-1);
                        const prev = STEP_ORDER[currentIdx - 1];
                        if (prev) useOnboardingStore.getState().setStep(prev);
                      }}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--foreground)] text-[14px] font-medium cursor-pointer hover:bg-[var(--af-bg4)] transition-all active:scale-[0.97] flex-shrink-0"
                    >
                      <ArrowLeft size={16} aria-hidden="true"/>
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-gradient-to-r from-[var(--af-accent)] to-[var(--af-accent2)] text-background text-[14px] font-semibold cursor-pointer hover:shadow-lg hover:shadow-[var(--af-accent)]/20 transition-all active:scale-[0.97] border-none"
                  >
                    {isLast ? (
                      <>
                        <Rocket size={16} aria-hidden="true"/>
                        Başla
                      </>
                    ) : (
                      <>
                        İleri
                        <ArrowRight size={16} aria-hidden="true"/>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
