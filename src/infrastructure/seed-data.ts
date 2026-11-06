// ═══════════════════════════════════════════════════════════
// داده Seed — جدول مرجع اولیه وستینگهاوس — FR-13
// ⚠ این جدول فقط «نقطه شروع نرم‌افزار» است؛ نسخه رایج از نظام
// Westinghouse (در یکی از بازنشرهای دانشگاهی به Lowry, Maynard
// & Stegemerten, 1940, p.233 نسبت داده شده) و پیش از استفاده عملی
// باید توسط کارشناس/رویه شرکت تأیید شود. استاندارد جهان‌شمول نیست.
// ═══════════════════════════════════════════════════════════
import type { RatingFactor } from '@/domain/types'

export interface SeedGrade {
  factor: RatingFactor
  gradeCode: string
  label: string
  value: number
  hint: string
  sortOrder: number
}

export const WESTINGHOUSE_SEED_GRADES: SeedGrade[] = [
  // ── مهارت ──
  { factor: 'SKILL', gradeCode: 'A1', label: 'عالی‌تر', value: 0.15, sortOrder: 1, hint: 'تسلط کامل و روان؛ حرکات دقیق، پیوسته و بدون مکث' },
  { factor: 'SKILL', gradeCode: 'A2', label: 'عالی', value: 0.13, sortOrder: 2, hint: 'تسلط بالا؛ هماهنگی عالی دست و چشم با توقف ناچیز' },
  { factor: 'SKILL', gradeCode: 'B1', label: 'خوب‌تر', value: 0.11, sortOrder: 3, hint: 'مهارت خوب؛ حرکات روان با مکث‌های گاه‌به‌گاه' },
  { factor: 'SKILL', gradeCode: 'B2', label: 'خوب', value: 0.08, sortOrder: 4, hint: 'مهارت قابل اتکا؛ روش کار منظم و پیوسته' },
  { factor: 'SKILL', gradeCode: 'C1', label: 'متوسط رو به بالا', value: 0.06, sortOrder: 5, hint: 'بالاتر از متوسط؛ با کمی تردید در حرکات' },
  { factor: 'SKILL', gradeCode: 'C2', label: 'متوسط', value: 0.03, sortOrder: 6, hint: 'مهارت متوسط؛ گاهی دقت و هماهنگی کم می‌شود' },
  { factor: 'SKILL', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 7, hint: 'سطح مرجع ارزیابی؛ عملکرد معمول انتظارشده' },
  { factor: 'SKILL', gradeCode: 'E1', label: 'ضعیف‌تر', value: -0.05, sortOrder: 8, hint: 'کمی ضعیف‌تر از قابل قبول؛ مکث و تردید محسوس' },
  { factor: 'SKILL', gradeCode: 'E2', label: 'ضعیف', value: -0.1, sortOrder: 9, hint: 'مهارت ضعیف؛ حرکات ناهماهنگ و مکرر' },
  { factor: 'SKILL', gradeCode: 'F1', label: 'بسیار ضعیف‌تر', value: -0.16, sortOrder: 10, hint: 'آشنا با کار اما ناتوان در اجرای روان' },
  { factor: 'SKILL', gradeCode: 'F2', label: 'بسیار ضعیف', value: -0.22, sortOrder: 11, hint: 'ناآشنا با کار؛ حرکات بسیار ناکارآمد' },
  // ── تلاش ──
  { factor: 'EFFORT', gradeCode: 'A1', label: 'کوشش فوق‌العاده', value: 0.13, sortOrder: 1, hint: 'تمرکز و سرعت بی‌وقفه در کل چرخه' },
  { factor: 'EFFORT', gradeCode: 'A2', label: 'کوشش بسیار زیاد', value: 0.12, sortOrder: 2, hint: 'مصمم و پرانگیزه با حداقل وقفه' },
  { factor: 'EFFORT', gradeCode: 'B1', label: 'کوشش زیاد', value: 0.1, sortOrder: 3, hint: 'از متوسط بیشتر؛ ریتم پایدار و هدفمند' },
  { factor: 'EFFORT', gradeCode: 'B2', label: 'کوشش خوب', value: 0.08, sortOrder: 4, hint: 'علاقه و توجه مشخص به کار' },
  { factor: 'EFFORT', gradeCode: 'C1', label: 'کوشش متوسط رو به بالا', value: 0.05, sortOrder: 5, hint: 'کمی بیش از متوسط' },
  { factor: 'EFFORT', gradeCode: 'C2', label: 'کوشش متوسط', value: 0.02, sortOrder: 6, hint: 'حالت معمول و روان کار' },
  { factor: 'EFFORT', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 7, hint: 'سطح مرجع ارزیابی تلاش' },
  { factor: 'EFFORT', gradeCode: 'E1', label: 'کوشش کم', value: -0.04, sortOrder: 8, hint: 'بی‌میلی محسوس و کندی گاه‌به‌گاه' },
  { factor: 'EFFORT', gradeCode: 'E2', label: 'کوشش بسیار کم', value: -0.08, sortOrder: 9, hint: 'کند و بی‌انگیزه؛ وقفه‌های مکرر' },
  { factor: 'EFFORT', gradeCode: 'F1', label: 'کوشش ناچیز', value: -0.12, sortOrder: 10, hint: 'بی‌توجه به پیشرفت کار' },
  { factor: 'EFFORT', gradeCode: 'F2', label: 'بی‌انگیزه', value: -0.17, sortOrder: 11, hint: 'مقاومت آشکار در برابر کار' },
  // ── شرایط ──
  { factor: 'CONDITIONS', gradeCode: 'A', label: 'ایده‌آل', value: 0.06, sortOrder: 1, hint: 'شرایط کاری ممتاز؛ روشنایی، دما و نظم عالی' },
  { factor: 'CONDITIONS', gradeCode: 'B', label: 'خوب', value: 0.04, sortOrder: 2, hint: 'شرایط مطلوب و راحت برای کار' },
  { factor: 'CONDITIONS', gradeCode: 'C', label: 'متوسط', value: 0.02, sortOrder: 3, hint: 'قابل تحمل؛ کمی بهتر از معمول' },
  { factor: 'CONDITIONS', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 4, hint: 'سطح مرجع ارزیابی شرایط' },
  { factor: 'CONDITIONS', gradeCode: 'E', label: 'ضعیف', value: -0.03, sortOrder: 5, hint: 'عوامل مزاحم (سر و صدا، دما، نور ناکافی)' },
  { factor: 'CONDITIONS', gradeCode: 'F', label: 'بسیار ضعیف', value: -0.07, sortOrder: 6, hint: 'شرایط نامطلوب و خسته‌کننده؛ اثر محسوس بر عملکرد' },
  // ── یکنواختی ──
  { factor: 'CONSISTENCY', gradeCode: 'A', label: 'کاملاً یکنواخت', value: 0.04, sortOrder: 1, hint: 'ریتم کار بدون تغییر محسوس در تمام چرخه‌ها' },
  { factor: 'CONSISTENCY', gradeCode: 'B', label: 'یکنواخت', value: 0.03, sortOrder: 2, hint: 'تغییرات بسیار جزئی بین چرخه‌ها' },
  { factor: 'CONSISTENCY', gradeCode: 'C', label: 'تقریباً یکنواخت', value: 0.01, sortOrder: 3, hint: 'پراکندگی کم در زمان‌های تکراری' },
  { factor: 'CONSISTENCY', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 4, hint: 'سطح مرجع ارزیابی یکنواختی' },
  { factor: 'CONSISTENCY', gradeCode: 'E', label: 'ناپایدار', value: -0.02, sortOrder: 5, hint: 'نوسان قابل مشاهده در زمان‌ها؛ نیازمند بازبینی' },
  { factor: 'CONSISTENCY', gradeCode: 'F', label: 'بسیار ناپایدار', value: -0.04, sortOrder: 6, hint: 'نوسان شدید؛ احتمال داده غیرعادی یا نیاز به آموزش' },
]

export const WESTINGHOUSE_SEED_META = {
  name: 'جدول وستینگهاوس — نسخه مرجع اولیه',
  source:
    'نسخه رایج از نظام Westinghouse (در بازنشرهای آموزشی؛ در یکی از منابع به Lowry, Maynard & Stegemerten, 1940, p.233 نسبت داده شده). این نسخه صرفاً نقطه شروع است و استاندارد جهان‌شمول یا رویه مصوب شرکت نیست؛ پیش از استفاده عملی توسط کارشناس تأیید شود.',
  notes:
    'Seed اولیه نرم‌افزار. مقادیر و برچسب‌ها قابل ویرایش است؛ هر تغییر باید با «ذخیره نسخه جدید» ثبت شود تا محاسبات تاریخی بی‌صدا تغییر نکند.',
} as const
