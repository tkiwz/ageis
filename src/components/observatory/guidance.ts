/** Safety guidance per hazard: before / during / after, in Arabic and English. */
export type GuideId = "wadis" | "storms" | "cyclones" | "dust" | "heat" | "fog" | "quakes" | "sea";
type T = { en: string; ar: string };
export interface Guide { id: GuideId; title: T; before: T[]; during: T[]; after: T[] }

const t = (en: string, ar: string): T => ({ en, ar });

export const GUIDES: Guide[] = [
  {
    id: "wadis", title: t("Heavy rain and wadis", "الأمطار الغزيرة والأودية"),
    before: [
      t("Check the wadi risk on the map before you travel, especially to the mountains.", "شيّك خطر الأودية على الخريطة قبل السفر، خصوصاً للجبال."),
      t("Avoid camping or parking in wadi beds, even under a clear sky.", "لا تخيّم ولا توقف سيارتك في بطون الأودية، حتى لو السماء صافية."),
      t("Agree on a route that avoids wadi crossings.", "اختر طريقاً ما فيه عبور أودية."),
    ],
    during: [
      t("Never cross a flowing wadi — on foot or by car. 30 cm of fast water can sweep a car away.", "لا تعبر وادي جاري أبداً، لا مشياً ولا بالسيارة. 30 سم من الماء السريع تكفي لجرف سيارة."),
      t("Rain up in the mountains can bring a flood to you within minutes.", "مطر في أعالي الجبال قد يوصل لك سيل خلال دقائق."),
      t("Move to high ground and stay away from wadi banks.", "اطلع لمكان مرتفع وابتعد عن ضفاف الأودية."),
      t("Keep children away from water channels and pools.", "أبعد الأطفال عن مجاري الماء والبرك."),
    ],
    after: [
      t("Wait until the wadi has stopped flowing completely before crossing.", "انتظر لين يتوقف الوادي تماماً قبل العبور."),
      t("Watch for damaged roads, mud and hidden holes.", "انتبه للطرق المتضررة والطين والحفر المخفية."),
      t("Report people trapped: call 9999.", "بلّغ عن العالقين: اتصل 9999."),
    ],
  },
  {
    id: "storms", title: t("Thunderstorms and lightning", "العواصف الرعدية والبرق"),
    before: [
      t("Plan outdoor work for the morning; storms over the Hajar usually build in the afternoon.", "خطّط للعمل في الخارج صباحاً؛ عواصف الحجر تتكوّن غالباً بعد الظهر."),
      t("Tie down or bring in loose items.", "ثبّت الأشياء السائبة أو أدخلها."),
    ],
    during: [
      t("When you hear thunder, go indoors or into a car with the windows closed.", "إذا سمعت الرعد ادخل مبنى أو سيارة والنوافذ مغلقة."),
      t("Stay away from open ground, hilltops, isolated trees and metal poles.", "ابتعد عن الأماكن المكشوفة وقمم التلال والأشجار المنفردة والأعمدة المعدنية."),
      t("Stop crane lifts, work at height and electrical work.", "أوقف أعمال الرافعات والعمل على ارتفاع والأعمال الكهربائية."),
    ],
    after: [
      t("Wait 30 minutes after the last thunder before going back outside.", "انتظر 30 دقيقة بعد آخر رعد قبل الرجوع للخارج."),
      t("Keep clear of fallen power lines.", "ابتعد عن أسلاك الكهرباء الساقطة."),
    ],
  },
  {
    id: "cyclones", title: t("Tropical cyclones", "الأعاصير المدارية"),
    before: [
      t("Follow the cyclone path on the map and official announcements.", "تابع مسار الإعصار على الخريطة والبيانات الرسمية."),
      t("Prepare water, food, medicine, torches, power banks and documents for 3 days.", "جهّز ماء وأكل وأدوية ومصابيح وشواحن ووثائق تكفي 3 أيام."),
      t("Know your nearest shelter and leave low coastal areas and wadis when told to.", "اعرف أقرب مركز إيواء، واترك المناطق الساحلية المنخفضة والأودية عند الطلب."),
    ],
    during: [
      t("Stay indoors away from windows; don't go out in the calm of the eye — the wind returns.", "ابقَ في الداخل بعيداً عن النوافذ، ولا تخرج وقت الهدوء في عين الإعصار فالرياح ترجع."),
      t("Don't drive through flooded roads.", "لا تقود في الطرق المغمورة."),
    ],
    after: [
      t("Stay away from damaged buildings, flood water and fallen cables.", "ابتعد عن المباني المتضررة ومياه السيول والأسلاك الساقطة."),
      t("Drink only safe or boiled water.", "اشرب ماء آمن أو مغلي فقط."),
    ],
  },
  {
    id: "dust", title: t("Dust and sandstorms", "الغبار والعواصف الرملية"),
    before: [
      t("People with asthma or heart problems: keep medicine at hand.", "مرضى الربو والقلب: خلّوا الأدوية في متناول اليد."),
      t("Close windows and doors.", "أغلق النوافذ والأبواب."),
    ],
    during: [
      t("Wear a mask outdoors; limit outdoor work.", "البس كمامة في الخارج وقلّل العمل في الخارج."),
      t("Driving: slow down, headlights on, keep distance; pull off the road if you can't see.", "في القيادة: خفّف السرعة، شغّل الأضواء، اترك مسافة، واطلع من الطريق إذا انعدمت الرؤية."),
      t("Stop crane lifts when visibility drops.", "أوقف أعمال الرافعات إذا قلّت الرؤية."),
    ],
    after: [t("Clean air filters and check vehicles.", "نظّف فلاتر الهواء وافحص السيارات.")],
  },
  {
    id: "heat", title: t("Extreme heat", "الحر الشديد"),
    before: [
      t("Schedule heavy outdoor work early morning or evening.", "رتّب الأعمال الشاقة في الخارج للصباح الباكر أو المساء."),
      t("In summer, Oman bans outdoor work in the sun from 12:30 to 3:30 pm (June–August).", "في الصيف يُمنع العمل تحت الشمس في عُمان من 12:30 إلى 3:30 عصراً (يونيو–أغسطس)."),
    ],
    during: [
      t("Drink water every 15–20 minutes, even if not thirsty.", "اشرب ماء كل 15 إلى 20 دقيقة حتى لو ما عطشت."),
      t("Rest in the shade; wear light, loose clothing.", "استرح في الظل والبس ملابس خفيفة وواسعة."),
      t("Never leave children or pets in a parked car.", "لا تترك الأطفال أو الحيوانات في سيارة متوقفة أبداً."),
    ],
    after: [
      t("Signs of heat stroke — confusion, hot dry skin, fainting: cool the person and call 9999.", "علامات ضربة الشمس — تشوّش، جلد حار وجاف، إغماء: برّد الشخص واتصل 9999."),
    ],
  },
  {
    id: "fog", title: t("Fog", "الضباب"),
    before: [t("Allow extra travel time on coastal and desert roads at dawn.", "خلّ وقتاً إضافياً للسفر على الطرق الساحلية والصحراوية وقت الفجر.")],
    during: [
      t("Slow down, use dipped headlights and fog lights, not high beams.", "خفّف السرعة واستخدم الأضواء المنخفضة وأضواء الضباب، مو العالية."),
      t("Don't overtake; keep a long distance.", "لا تتجاوز واترك مسافة طويلة."),
    ],
    after: [t("Fog usually clears by mid-morning.", "الضباب عادة ينقشع قبل منتصف الصباح.")],
  },
  {
    id: "quakes", title: t("Earthquakes and tsunami", "الزلازل والتسونامي"),
    before: [
      t("Fix heavy furniture to walls; know safe spots in each room.", "ثبّت الأثاث الثقيل في الجدران، واعرف الأماكن الآمنة في كل غرفة."),
      t("Coastal areas: know the way to high ground — the Makran zone off Pakistan and Iran can cause tsunamis.", "في المناطق الساحلية: اعرف طريقك لمكان مرتفع — منطقة مكران قبالة باكستان وإيران قد تسبب تسونامي."),
    ],
    during: [
      t("Drop, cover under sturdy furniture, hold on. Stay away from windows.", "انخفض، احتمِ تحت أثاث متين، وتمسّك. ابتعد عن النوافذ."),
      t("On the coast, if the shaking is strong or the sea pulls back suddenly, move to high ground at once.", "على الساحل، إذا كان الاهتزاز قوي أو انسحب البحر فجأة، اطلع لمكان مرتفع فوراً."),
    ],
    after: [
      t("Expect aftershocks; check for gas leaks and damage.", "توقّع هزات ارتدادية، وافحص تسرب الغاز والأضرار."),
      t("Don't return to the coast until officials say it's safe.", "لا ترجع للساحل لين يعلن المسؤولون أنه آمن."),
    ],
  },
  {
    id: "sea", title: t("High waves and the sea", "الموج العالي والبحر"),
    before: [t("Check wave height on the map before fishing or boat trips.", "شيّك ارتفاع الموج على الخريطة قبل الصيد أو رحلات القوارب.")],
    during: [
      t("Waves above 2.5 m: small boats should stay in port.", "موج فوق 2.5 م: القوارب الصغيرة تبقى في الميناء."),
      t("Don't swim when the sea is rough; beware of rip currents.", "لا تسبح إذا البحر مضطرب، وانتبه للتيارات الساحبة."),
    ],
    after: [t("Watch for debris on beaches and in harbours.", "انتبه للمخلفات على الشواطئ وفي الموانئ.")],
  },
];
