"""2026-10-19 resubmission fixes to the App Store description/keywords in locales/*.json.

Run after sync-live.py (which copies the LIVE text, incl. the subscription paragraph, into locales/).
Each old string must occur exactly once, or the script stops without writing anything.

1. "Ready for TikTok, Reels and Shorts" bullet -> "Exports vertical 9:16 video, ready for any social app".
2. "Import up to ten videos at once" -> "Import a whole batch of videos at once".
3. Privacy paragraph scoped to videos: "Your videos are edited on your iPhone and never uploaded. No account needed."
4. Filler bullet: drop the example words outside English/Spanish (FillerLexicon only knows en + es words).
5. Locales outside en/es/fr/de/it/pt get one line on which languages the speech features cover
   (the in-app picker: English, Spanish, French, German, Italian, Portuguese; silence removal is language-free).
6. ja keywords: ショート,ユーチューバー -> 縦型動画,自動編集.
Usage: python3 fix-2026-10-19.py [--dry]
"""
import json, os, sys

D = os.path.dirname(os.path.abspath(__file__))

EN = dict(
    batch=("Import up to ten videos at once", "Import a whole batch of videos at once"),
    social="• Exports vertical 9:16 video, ready for any social app",
    privacy="Your videos are edited on your iPhone and never uploaded. No account needed.",
)

# loc: batch=(old,new), social, privacy, filler (new bullet, optional), speech (sentence, optional)
FIX = {
    'ar-SA': dict(
        batch=("استورد حتى عشرة فيديوهات دفعة واحدة", "استورد دفعة كاملة من الفيديوهات مرة واحدة"),
        social="• يصدّر فيديو عموديًا بمقاس 9:16، جاهزًا لأي تطبيق تواصل اجتماعي",
        privacy="تُحرَّر فيديوهاتك على جهاز iPhone ولا تُرفع أبدًا. لا حاجة إلى حساب.",
        filler="• يزيل كلمات الحشو واللقطات المكررة",
        speech="تعمل التسميات التوضيحية وإزالة كلمات الحشو واللقطات المكررة مع الفيديوهات باللغات الإنجليزية والإسبانية والفرنسية والألمانية والإيطالية والبرتغالية؛ أما إزالة الصمت فتعمل بأي لغة."),
    'bn-BD': dict(
        batch=("একসাথে দশটি পর্যন্ত ভিডিও ইমপোর্ট করুন", "একসাথে পুরো এক ব্যাচ ভিডিও ইমপোর্ট করুন"),
        social="• ভার্টিক্যাল 9:16 ভিডিও এক্সপোর্ট করে, যেকোনো সোশ্যাল অ্যাপের জন্য প্রস্তুত",
        privacy="আপনার ভিডিও আপনার iPhone-এই এডিট হয়, কখনো আপলোড হয় না। কোনো অ্যাকাউন্ট লাগে না।",
        filler="• ফিলার শব্দ আর বারবার নেওয়া টেক সরায়",
        speech="ক্যাপশন, ফিলার শব্দ আর বারবার নেওয়া টেক সরানো ইংরেজি, স্প্যানিশ, ফরাসি, জার্মান, ইতালীয় ও পর্তুগিজ ভাষার ভিডিওতে কাজ করে; নীরবতা কাটা যেকোনো ভাষায় কাজ করে।"),
    'ca': dict(
        batch=("Importa fins a deu vídeos alhora", "Importa un lot sencer de vídeos alhora"),
        social="• Exporta vídeo vertical 9:16, a punt per a qualsevol xarxa social",
        privacy="Els teus vídeos s'editen al teu iPhone i no es pugen mai. No cal compte.",
        filler="• Elimina les crosses i les preses repetides",
        speech="Els subtítols i l'eliminació de crosses i preses repetides funcionen amb vídeos en anglès, castellà, francès, alemany, italià i portuguès; l'eliminació de silencis funciona en qualsevol idioma."),
    'cs': dict(
        batch=("Importuj až deset videí najednou", "Importuj celou dávku videí najednou"),
        social="• Exportuje video na výšku 9:16, připravené pro jakoukoli sociální síť",
        privacy="Tvoje videa se upravují na tvém iPhonu a nikdy se nenahrávají. Účet není potřeba.",
        filler="• Odstraní vycpávková slova a opakované záběry",
        speech="Titulky a odstranění vycpávkových slov a opakovaných záběrů fungují u videí v angličtině, španělštině, francouzštině, němčině, italštině a portugalštině; odstranění ticha funguje v jakémkoli jazyce."),
    'da': dict(
        batch=("Importér op til ti videoer på én gang", "Importér en hel bunke videoer på én gang"),
        social="• Eksporterer lodret 9:16-video, klar til enhver social app",
        privacy="Dine videoer redigeres på din iPhone og uploades aldrig. Ingen konto nødvendig.",
        filler="• Fjerner fyldord og gentagne optagelser",
        speech="Undertekster og fjernelse af fyldord og gentagne optagelser virker til videoer på engelsk, spansk, fransk, tysk, italiensk og portugisisk; fjernelse af stilhed virker på alle sprog."),
    'de-DE': dict(
        batch=("Importiere bis zu zehn Videos auf einmal", "Importiere einen ganzen Stapel Videos auf einmal"),
        social="• Exportiert Hochkant-Videos in 9:16, bereit für jede Social-App",
        privacy="Deine Videos werden auf deinem iPhone bearbeitet und nie hochgeladen. Kein Konto nötig.",
        filler="• Entfernt Füllwörter und wiederholte Takes"),
    'el': dict(
        batch=("Εισάγεις έως δέκα βίντεο μαζί", "Εισάγεις μια ολόκληρη σειρά βίντεο μαζί"),
        social="• Εξάγει κάθετο βίντεο 9:16, έτοιμο για οποιαδήποτε εφαρμογή κοινωνικής δικτύωσης",
        privacy="Τα βίντεό σου επεξεργάζονται στο iPhone σου και δεν ανεβαίνουν ποτέ. Δεν χρειάζεται λογαριασμός.",
        filler="• Αφαιρεί λέξεις-γεμίσματα και επαναλαμβανόμενες λήψεις",
        speech="Οι υπότιτλοι και η αφαίρεση λέξεων-γεμισμάτων και επαναλαμβανόμενων λήψεων λειτουργούν σε βίντεο στα αγγλικά, ισπανικά, γαλλικά, γερμανικά, ιταλικά και πορτογαλικά· η αφαίρεση σιωπών λειτουργεί σε οποιαδήποτε γλώσσα."),
    'en-AU': EN, 'en-CA': EN, 'en-GB': EN, 'en-US': EN,
    'es-ES': dict(
        batch=("Importa hasta diez vídeos a la vez", "Importa un lote entero de vídeos a la vez"),
        social="• Exporta vídeo vertical 9:16, listo para cualquier red social",
        privacy="Tus vídeos se editan en tu iPhone y nunca se suben. No necesitas cuenta."),
    'es-MX': dict(
        batch=("Importa hasta diez videos a la vez", "Importa un lote completo de videos a la vez"),
        social="• Exporta video vertical 9:16, listo para cualquier red social",
        privacy="Tus videos se editan en tu iPhone y nunca se suben. No necesitas cuenta."),
    'fi': dict(
        batch=("Tuo jopa kymmenen videota kerralla", "Tuo kokonainen erä videoita kerralla"),
        social="• Vie pystysuuntaisen 9:16-videon, valmiina mihin tahansa somesovellukseen",
        privacy="Videosi muokataan iPhonessasi, eikä niitä koskaan ladata pilveen. Tiliä ei tarvita.",
        filler="• Poistaa täytesanat ja toistetut otot",
        speech="Tekstitykset sekä täytesanojen ja toistettujen ottojen poisto toimivat englannin-, espanjan-, ranskan-, saksan-, italian- ja portugalinkielisille videoille; hiljaisuuksien poisto toimii millä tahansa kielellä."),
    'fr-CA': dict(
        batch=("Importez jusqu'à dix vidéos à la fois", "Importez tout un lot de vidéos à la fois"),
        social="• Exporte en vidéo verticale 9:16, prête pour n'importe quel réseau social",
        privacy="Vos vidéos sont montées sur votre iPhone et ne sont jamais téléversées. Aucun compte requis.",
        filler="• Retire les mots parasites et les prises répétées"),
    'fr-FR': dict(
        batch=("Importez jusqu'à dix vidéos à la fois", "Importez tout un lot de vidéos à la fois"),
        social="• Exporte en vidéo verticale 9:16, prête pour n'importe quel réseau social",
        privacy="Vos vidéos sont montées sur votre iPhone et ne sont jamais envoyées en ligne. Aucun compte nécessaire.",
        filler="• Retire les mots parasites et les prises répétées"),
    'gu-IN': dict(
        batch=("એકસાથે દસ સુધી વીડિયો ઇમ્પોર્ટ કરો", "એકસાથે વીડિયોની આખી બેચ ઇમ્પોર્ટ કરો"),
        social="• વર્ટિકલ 9:16 વીડિયો એક્સપોર્ટ કરે છે, કોઈપણ સોશિયલ ઍપ માટે તૈયાર",
        privacy="તમારા વીડિયો તમારા iPhone પર જ એડિટ થાય છે અને ક્યારેય અપલોડ થતા નથી. કોઈ એકાઉન્ટની જરૂર નથી.",
        filler="• ફિલર શબ્દો અને ફરી લીધેલા ટેક દૂર કરે છે",
        speech="કૅપ્શન, ફિલર શબ્દો અને ફરી લીધેલા ટેક દૂર કરવાનું અંગ્રેજી, સ્પેનિશ, ફ્રેન્ચ, જર્મન, ઇટાલિયન અને પોર્ટુગીઝ વીડિયોમાં કામ કરે છે; મૌન દૂર કરવાનું કોઈપણ ભાષામાં કામ કરે છે."),
    'he': dict(
        batch=("מייבאים עד עשרה סרטונים בבת אחת", "מייבאים סדרה שלמה של סרטונים בבת אחת"),
        social="• מייצא וידאו אנכי ביחס 9:16, מוכן לכל אפליקציה חברתית",
        privacy="הסרטונים שלכם נערכים ב־iPhone שלכם ולעולם לא מועלים. אין צורך בחשבון.",
        filler="• מסיר מילות מילוי וטייקים חוזרים",
        speech="כתוביות והסרת מילות מילוי וטייקים חוזרים עובדות בסרטונים באנגלית, ספרדית, צרפתית, גרמנית, איטלקית ופורטוגזית; הסרת שקט עובדת בכל שפה."),
    'hi': dict(
        batch=("एक साथ दस तक वीडियो इम्पोर्ट करें", "एक साथ वीडियो का पूरा बैच इम्पोर्ट करें"),
        social="• वर्टिकल 9:16 वीडियो एक्सपोर्ट करता है, किसी भी सोशल ऐप के लिए तैयार",
        privacy="आपके वीडियो आपके iPhone पर ही एडिट होते हैं और कभी अपलोड नहीं होते। किसी अकाउंट की ज़रूरत नहीं।",
        filler="• फ़िलर वर्ड्स और दोहराए गए टेक हटाता है",
        speech="कैप्शन, फ़िलर वर्ड्स और दोहराए गए टेक हटाने की सुविधा अंग्रेज़ी, स्पैनिश, फ़्रेंच, जर्मन, इतालवी और पुर्तगाली वीडियो में काम करती है; साइलेंस हटाना किसी भी भाषा में काम करता है।"),
    'hr': dict(
        batch=("Uvezi do deset videa odjednom", "Uvezi cijelu hrpu videa odjednom"),
        social="• Izvozi uspravni video 9:16, spreman za bilo koju društvenu mrežu",
        privacy="Tvoji se videi uređuju na tvom iPhoneu i nikad se ne prenose na internet. Račun nije potreban.",
        filler="• Uklanja poštapalice i ponovljene kadrove",
        speech="Titlovi te uklanjanje poštapalica i ponovljenih kadrova rade za videe na engleskom, španjolskom, francuskom, njemačkom, talijanskom i portugalskom; uklanjanje tišine radi na bilo kojem jeziku."),
    'hu': dict(
        batch=("Importálj egyszerre akár tíz videót", "Importálj egyszerre egy egész adag videót"),
        social="• Álló, 9:16-os videót exportál, bármelyik közösségi apphoz készen",
        privacy="A videóidat az iPhone-odon szerkeszti, és soha nem tölti fel őket. Nincs szükség fiókra.",
        filler="• Eltávolítja a töltelékszavakat és az ismételt felvételeket",
        speech="A feliratok, valamint a töltelékszavak és az ismételt felvételek eltávolítása angol, spanyol, francia, német, olasz és portugál nyelvű videóknál működik; a csend eltávolítása bármilyen nyelven működik."),
    'id': dict(
        batch=("Impor hingga sepuluh video sekaligus", "Impor satu batch video sekaligus"),
        social="• Ekspor video vertikal 9:16, siap untuk aplikasi sosial apa pun",
        privacy="Video kamu diedit di iPhone kamu dan tidak pernah diunggah. Tidak perlu akun.",
        filler="• Menghapus kata pengisi dan take berulang",
        speech="Teks, penghapusan kata pengisi, dan penghapusan take berulang berfungsi untuk video berbahasa Inggris, Spanyol, Prancis, Jerman, Italia, dan Portugis; penghapusan hening berfungsi dalam bahasa apa pun."),
    'it': dict(
        batch=("Importa fino a dieci video alla volta", "Importa un intero blocco di video alla volta"),
        social="• Esporta video verticali 9:16, pronti per qualsiasi app social",
        privacy="I tuoi video vengono montati sul tuo iPhone e non vengono mai caricati. Nessun account necessario.",
        filler="• Elimina gli intercalari e i take ripetuti"),
    'ja': dict(
        batch=("最大10本の動画をまとめて読み込み", "動画をまとめて一括で読み込み"),
        social="• 縦型9:16で書き出し、SNSにすぐ使える",
        privacy="動画はiPhone上で編集され、アップロードされることはありません。アカウントも不要です。",
        filler="• フィラーと撮り直しを削除",
        speech="字幕、フィラー・撮り直しの削除は、英語、スペイン語、フランス語、ドイツ語、イタリア語、ポルトガル語の動画に対応しています。無音カットはどの言語でも使えます。",
        keywords=("切り抜き,ショート,ユーチューバー", "切り抜き,縦型動画,自動編集")),
    'kn-IN': dict(
        batch=("ಒಮ್ಮೆಗೆ ಹತ್ತು ವಿಡಿಯೋಗಳವರೆಗೆ ಇಂಪೋರ್ಟ್ ಮಾಡಿ", "ಒಮ್ಮೆಗೆ ವಿಡಿಯೋಗಳ ಪೂರ್ತಿ ಬ್ಯಾಚ್ ಇಂಪೋರ್ಟ್ ಮಾಡಿ"),
        social="• ವರ್ಟಿಕಲ್ 9:16 ವಿಡಿಯೋ ಎಕ್ಸ್‌ಪೋರ್ಟ್ ಮಾಡುತ್ತದೆ, ಯಾವುದೇ ಸೋಶಿಯಲ್ ಆ್ಯಪ್‌ಗೆ ಸಿದ್ಧ",
        privacy="ನಿಮ್ಮ ವಿಡಿಯೋಗಳು ನಿಮ್ಮ iPhone ನಲ್ಲೇ ಎಡಿಟ್ ಆಗುತ್ತವೆ ಮತ್ತು ಎಂದಿಗೂ ಅಪ್‌ಲೋಡ್ ಆಗುವುದಿಲ್ಲ. ಖಾತೆ ಬೇಕಿಲ್ಲ.",
        filler="• ಫಿಲ್ಲರ್ ಪದಗಳು ಮತ್ತು ಪುನರಾವರ್ತಿತ ಟೇಕ್‌ಗಳನ್ನು ತೆಗೆಯುತ್ತದೆ",
        speech="ಕ್ಯಾಪ್ಷನ್‌ಗಳು, ಫಿಲ್ಲರ್ ಪದಗಳು ಮತ್ತು ಪುನರಾವರ್ತಿತ ಟೇಕ್‌ಗಳನ್ನು ತೆಗೆಯುವುದು ಇಂಗ್ಲಿಷ್, ಸ್ಪ್ಯಾನಿಷ್, ಫ್ರೆಂಚ್, ಜರ್ಮನ್, ಇಟಾಲಿಯನ್ ಮತ್ತು ಪೋರ್ಚುಗೀಸ್ ವಿಡಿಯೋಗಳಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ; ಮೌನ ತೆಗೆಯುವುದು ಯಾವುದೇ ಭಾಷೆಯಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ."),
    'ko': dict(
        batch=("최대 10개의 영상을 한 번에 가져오고", "영상 한 묶음을 통째로 한 번에 가져오고"),
        social="• 세로 9:16 영상으로 내보내기, SNS에 바로 사용",
        privacy="영상은 iPhone에서 편집되며 업로드되지 않습니다. 계정도 필요 없습니다.",
        filler="• 필러 단어와 반복 테이크 제거",
        speech="자막, 필러 단어 및 반복 테이크 제거는 영어, 스페인어, 프랑스어, 독일어, 이탈리아어, 포르투갈어 영상에서 작동하며, 무음 제거는 모든 언어에서 작동합니다."),
    'ml-IN': dict(
        batch=("ഒരേസമയം പത്ത് വീഡിയോ വരെ ഇംപോർട്ട് ചെയ്യൂ", "ഒരേസമയം ഒരു മുഴുവൻ ബാച്ച് വീഡിയോകൾ ഇംപോർട്ട് ചെയ്യൂ"),
        social="• വെർട്ടിക്കൽ 9:16 വീഡിയോ എക്സ്പോർട്ട് ചെയ്യുന്നു, ഏത് സോഷ്യൽ ആപ്പിനും റെഡി",
        privacy="നിങ്ങളുടെ വീഡിയോകൾ നിങ്ങളുടെ iPhone-ൽ തന്നെ എഡിറ്റ് ചെയ്യുന്നു, ഒരിക്കലും അപ്‌ലോഡ് ചെയ്യുന്നില്ല. അക്കൗണ്ട് വേണ്ട.",
        filler="• ഫില്ലർ വാക്കുകളും ആവർത്തിച്ച ടേക്കുകളും നീക്കുന്നു",
        speech="ക്യാപ്ഷനുകൾ, ഫില്ലർ വാക്കുകളും ആവർത്തിച്ച ടേക്കുകളും നീക്കൽ എന്നിവ ഇംഗ്ലീഷ്, സ്പാനിഷ്, ഫ്രഞ്ച്, ജർമ്മൻ, ഇറ്റാലിയൻ, പോർച്ചുഗീസ് വീഡിയോകളിൽ പ്രവർത്തിക്കും; നിശബ്ദത നീക്കൽ ഏത് ഭാഷയിലും പ്രവർത്തിക്കും."),
    'mr-IN': dict(
        batch=("एकाच वेळी दहा व्हिडिओपर्यंत इम्पोर्ट करा", "एकाच वेळी व्हिडिओंची संपूर्ण बॅच इम्पोर्ट करा"),
        social="• उभा 9:16 व्हिडिओ एक्सपोर्ट करतो, कोणत्याही सोशल ॲपसाठी तयार",
        privacy="तुमचे व्हिडिओ तुमच्या iPhone वरच एडिट होतात आणि कधीही अपलोड होत नाहीत. अकाउंटची गरज नाही.",
        filler="• फिलर शब्द आणि पुन्हा घेतलेले टेक काढतो",
        speech="कॅप्शन, फिलर शब्द आणि पुन्हा घेतलेले टेक काढणे इंग्रजी, स्पॅनिश, फ्रेंच, जर्मन, इटालियन आणि पोर्तुगीज व्हिडिओंसाठी काम करते; शांतता काढणे कोणत्याही भाषेत काम करते."),
    'ms': dict(
        batch=("Import sehingga sepuluh video sekali gus", "Import satu kumpulan penuh video sekali gus"),
        social="• Mengeksport video menegak 9:16, sedia untuk mana-mana app sosial",
        privacy="Video anda disunting di iPhone anda dan tidak pernah dimuat naik. Tiada akaun diperlukan.",
        filler="• Membuang perkataan pengisi dan rakaman berulang",
        speech="Kapsyen serta pembuangan perkataan pengisi dan rakaman berulang berfungsi untuk video dalam bahasa Inggeris, Sepanyol, Perancis, Jerman, Itali dan Portugis; pembuangan senyap berfungsi dalam apa-apa bahasa."),
    'nl-NL': dict(
        batch=("Importeer tot tien video's tegelijk", "Importeer een hele reeks video's tegelijk"),
        social="• Exporteert verticale 9:16-video, klaar voor elke social app",
        privacy="Je video's worden op je iPhone bewerkt en nooit geüpload. Geen account nodig.",
        filler="• Verwijdert stopwoorden en herhaalde takes",
        speech="Ondertitels en het verwijderen van stopwoorden en herhaalde takes werken voor video's in het Engels, Spaans, Frans, Duits, Italiaans en Portugees; stiltes verwijderen werkt in elke taal."),
    'no': dict(
        batch=("Importer opptil ti videoer på én gang", "Importer en hel bunke videoer på én gang"),
        social="• Eksporterer stående 9:16-video, klar for alle sosiale apper",
        privacy="Videoene dine redigeres på din iPhone og lastes aldri opp. Ingen konto nødvendig.",
        filler="• Fjerner fyllord og gjentatte opptak",
        speech="Teksting og fjerning av fyllord og gjentatte opptak fungerer for videoer på engelsk, spansk, fransk, tysk, italiensk og portugisisk; fjerning av stillhet fungerer på alle språk."),
    'or-IN': dict(
        batch=("ଏକାଥରେ ଦଶଟି ପର୍ଯ୍ୟନ୍ତ ଭିଡିଓ ଇମ୍ପୋର୍ଟ କରନ୍ତୁ", "ଏକାଥରେ ଭିଡିଓର ଏକ ପୂରା ବ୍ୟାଚ ଇମ୍ପୋର୍ଟ କରନ୍ତୁ"),
        social="• ଭର୍ଟିକାଲ 9:16 ଭିଡିଓ ଏକ୍ସପୋର୍ଟ କରେ, ଯେକୌଣସି ସୋସିଆଲ ଆପ ପାଇଁ ପ୍ରସ୍ତୁତ",
        privacy="ଆପଣଙ୍କ ଭିଡିଓ ଆପଣଙ୍କ iPhone ରେ ହିଁ ଏଡିଟ ହୁଏ ଏବଂ କେବେ ବି ଅପଲୋଡ ହୁଏ ନାହିଁ। କୌଣସି ଆକାଉଣ୍ଟ ଦରକାର ନାହିଁ।",
        filler="• ଫିଲର ଶବ୍ଦ ଓ ଦୋହରା ଟେକ ହଟାଏ",
        speech="କ୍ୟାପସନ, ଫିଲର ଶବ୍ଦ ଓ ଦୋହରା ଟେକ ହଟାଇବା ଇଂରାଜୀ, ସ୍ପାନିଶ, ଫ୍ରେଞ୍ଚ, ଜର୍ମାନ, ଇଟାଲିଆନ ଓ ପର୍ତ୍ତୁଗୀଜ ଭିଡିଓରେ କାମ କରେ; ନୀରବତା ହଟାଇବା ଯେକୌଣସି ଭାଷାରେ କାମ କରେ।"),
    'pa-IN': dict(
        batch=("ਇੱਕੋ ਵਾਰ ਦਸ ਤੱਕ ਵੀਡੀਓ ਇੰਪੋਰਟ ਕਰੋ", "ਇੱਕੋ ਵਾਰ ਵੀਡੀਓਜ਼ ਦਾ ਪੂਰਾ ਬੈਚ ਇੰਪੋਰਟ ਕਰੋ"),
        social="• ਵਰਟੀਕਲ 9:16 ਵੀਡੀਓ ਐਕਸਪੋਰਟ ਕਰਦਾ ਹੈ, ਕਿਸੇ ਵੀ ਸੋਸ਼ਲ ਐਪ ਲਈ ਤਿਆਰ",
        privacy="ਤੁਹਾਡੇ ਵੀਡੀਓ ਤੁਹਾਡੇ iPhone 'ਤੇ ਹੀ ਐਡਿਟ ਹੁੰਦੇ ਹਨ ਅਤੇ ਕਦੇ ਅਪਲੋਡ ਨਹੀਂ ਹੁੰਦੇ। ਕਿਸੇ ਖਾਤੇ ਦੀ ਲੋੜ ਨਹੀਂ।",
        filler="• ਫਿਲਰ ਸ਼ਬਦ ਅਤੇ ਦੁਹਰਾਏ ਟੇਕ ਹਟਾਉਂਦਾ ਹੈ",
        speech="ਕੈਪਸ਼ਨ, ਫਿਲਰ ਸ਼ਬਦ ਅਤੇ ਦੁਹਰਾਏ ਟੇਕ ਹਟਾਉਣਾ ਅੰਗਰੇਜ਼ੀ, ਸਪੈਨਿਸ਼, ਫ੍ਰੈਂਚ, ਜਰਮਨ, ਇਤਾਲਵੀ ਅਤੇ ਪੁਰਤਗਾਲੀ ਵੀਡੀਓਜ਼ ਵਿੱਚ ਕੰਮ ਕਰਦਾ ਹੈ; ਚੁੱਪ ਹਟਾਉਣਾ ਕਿਸੇ ਵੀ ਭਾਸ਼ਾ ਵਿੱਚ ਕੰਮ ਕਰਦਾ ਹੈ।"),
    'pl': dict(
        batch=("Zaimportuj do dziesięciu filmów naraz", "Zaimportuj całą paczkę filmów naraz"),
        social="• Eksportuje pionowe wideo 9:16, gotowe do dowolnej aplikacji społecznościowej",
        privacy="Twoje filmy są montowane na Twoim iPhonie i nigdy nie są wysyłane. Konto nie jest potrzebne.",
        filler="• Usuwa wypełniacze i powtórzone ujęcia",
        speech="Napisy oraz usuwanie wypełniaczy i powtórzonych ujęć działają w filmach po angielsku, hiszpańsku, francusku, niemiecku, włosku i portugalsku; usuwanie ciszy działa w każdym języku."),
    'pt-BR': dict(
        batch=("Importe até dez vídeos de uma vez", "Importe um lote inteiro de vídeos de uma vez"),
        social="• Exporta vídeo vertical 9:16, pronto para qualquer rede social",
        privacy="Seus vídeos são editados no seu iPhone e nunca são enviados para a nuvem. Não precisa de conta.",
        filler="• Remove vícios de linguagem e takes repetidos"),
    'pt-PT': dict(
        batch=("Importe até dez vídeos de uma vez", "Importe um lote inteiro de vídeos de uma vez"),
        social="• Exporta vídeo vertical 9:16, pronto para qualquer rede social",
        privacy="Os seus vídeos são editados no seu iPhone e nunca são carregados. Não precisa de conta.",
        filler="• Remove bordões e takes repetidos"),
    'ro': dict(
        batch=("Importă până la zece videoclipuri deodată", "Importă un lot întreg de videoclipuri deodată"),
        social="• Exportă video vertical 9:16, gata pentru orice aplicație socială",
        privacy="Videoclipurile tale sunt editate pe iPhone-ul tău și nu sunt încărcate niciodată. Nu ai nevoie de cont.",
        filler="• Elimină cuvintele de umplutură și dublele repetate",
        speech="Subtitrările și eliminarea cuvintelor de umplutură și a dublelor repetate funcționează pentru videoclipuri în engleză, spaniolă, franceză, germană, italiană și portugheză; eliminarea liniștii funcționează în orice limbă."),
    'ru': dict(
        batch=("Импортируйте до десяти видео за раз", "Импортируйте целую пачку видео за раз"),
        social="• Экспорт вертикального видео 9:16, готового для любой соцсети",
        privacy="Ваши видео монтируются на вашем iPhone и никуда не загружаются. Аккаунт не нужен.",
        filler="• Убирает слова-паразиты и повторные дубли",
        speech="Субтитры, удаление слов-паразитов и повторных дублей работают для видео на английском, испанском, французском, немецком, итальянском и португальском; удаление тишины работает на любом языке."),
    'sk': dict(
        batch=("Importuj až desať videí naraz", "Importuj celú dávku videí naraz"),
        social="• Exportuje video na výšku 9:16, pripravené pre akúkoľvek sociálnu sieť",
        privacy="Tvoje videá sa upravujú na tvojom iPhone a nikdy sa nenahrávajú. Účet nie je potrebný.",
        filler="• Odstráni vatové slová a opakované zábery",
        speech="Titulky a odstránenie vatových slov a opakovaných záberov fungujú pri videách v angličtine, španielčine, francúzštine, nemčine, taliančine a portugalčine; odstránenie ticha funguje v akomkoľvek jazyku."),
    'sl-SI': dict(
        batch=("Uvozi do deset videov naenkrat", "Uvozi cel paket videov naenkrat"),
        social="• Izvozi pokončni video 9:16, pripravljen za katero koli družbeno omrežje",
        privacy="Tvoji videi se urejajo na tvojem iPhonu in se nikoli ne naložijo v splet. Račun ni potreben.",
        filler="• Odstrani mašila in ponovljene posnetke",
        speech="Podnapisi ter odstranjevanje mašil in ponovljenih posnetkov delujejo za videe v angleščini, španščini, francoščini, nemščini, italijanščini in portugalščini; odstranjevanje tišine deluje v katerem koli jeziku."),
    'sv': dict(
        batch=("Importera upp till tio videor på en gång", "Importera en hel omgång videor på en gång"),
        social="• Exporterar stående 9:16-video, redo för alla sociala appar",
        privacy="Dina videor redigeras på din iPhone och laddas aldrig upp. Inget konto behövs.",
        filler="• Tar bort utfyllnadsord och upprepade tagningar",
        speech="Undertexter och borttagning av utfyllnadsord och upprepade tagningar fungerar för videor på engelska, spanska, franska, tyska, italienska och portugisiska; borttagning av tystnad fungerar på alla språk."),
    'ta-IN': dict(
        batch=("ஒரே நேரத்தில் பத்து வீடியோக்கள் வரை இம்போர்ட் செய்து", "ஒரே நேரத்தில் ஒரு முழு பேட்ச் வீடியோக்களை இம்போர்ட் செய்து"),
        social="• செங்குத்து 9:16 வீடியோவாக எக்ஸ்போர்ட் செய்யும், எந்த சோஷியல் ஆப்புக்கும் தயார்",
        privacy="உங்கள் வீடியோக்கள் உங்கள் iPhone-இலேயே எடிட் செய்யப்படும், ஒருபோதும் அப்லோட் செய்யப்படாது. அக்கவுண்ட் தேவையில்லை.",
        filler="• ஃபில்லர் வார்த்தைகளையும் திரும்ப எடுத்த டேக்குகளையும் நீக்குகிறது",
        speech="கேப்ஷன்கள், ஃபில்லர் வார்த்தைகள் மற்றும் திரும்ப எடுத்த டேக்குகளை நீக்குதல் ஆங்கிலம், ஸ்பானிஷ், பிரெஞ்சு, ஜெர்மன், இத்தாலியன், போர்ச்சுகீஸ் வீடியோக்களில் வேலை செய்யும்; மௌனம் நீக்குதல் எந்த மொழியிலும் வேலை செய்யும்."),
    'te-IN': dict(
        batch=("ఒకేసారి పది వీడియోల వరకు ఇంపోర్ట్ చేయండి", "ఒకేసారి వీడియోల పూర్తి బ్యాచ్‌ను ఇంపోర్ట్ చేయండి"),
        social="• వర్టికల్ 9:16 వీడియోగా ఎక్స్‌పోర్ట్ చేస్తుంది, ఏ సోషల్ యాప్‌కైనా సిద్ధం",
        privacy="మీ వీడియోలు మీ iPhone లోనే ఎడిట్ అవుతాయి, ఎప్పుడూ అప్‌లోడ్ కావు. అకౌంట్ అవసరం లేదు.",
        filler="• ఫిల్లర్ పదాలను మరియు మళ్లీ తీసిన టేక్‌లను తొలగిస్తుంది",
        speech="క్యాప్షన్లు, ఫిల్లర్ పదాలు మరియు మళ్లీ తీసిన టేక్‌ల తొలగింపు ఇంగ్లీష్, స్పానిష్, ఫ్రెంచ్, జర్మన్, ఇటాలియన్, పోర్చుగీస్ వీడియోలలో పనిచేస్తాయి; నిశ్శబ్దం తొలగింపు ఏ భాషలోనైనా పనిచేస్తుంది."),
    'th': dict(
        batch=("นำเข้าวิดีโอได้สูงสุด 10 คลิปพร้อมกัน", "นำเข้าวิดีโอทั้งชุดได้พร้อมกัน"),
        social="• ส่งออกวิดีโอแนวตั้ง 9:16 พร้อมใช้กับทุกแอปโซเชียล",
        privacy="วิดีโอของคุณถูกตัดต่อบน iPhone และไม่ถูกอัปโหลดไปไหน ไม่ต้องมีบัญชี",
        filler="• ลบคำติดปากและเทคซ้ำ",
        speech="คำบรรยาย การลบคำติดปาก และการลบเทคซ้ำ ใช้ได้กับวิดีโอภาษาอังกฤษ สเปน ฝรั่งเศส เยอรมัน อิตาลี และโปรตุเกส ส่วนการตัดช่วงเงียบใช้ได้กับทุกภาษา"),
    'tr': dict(
        batch=("Tek seferde on videoya kadar içe aktar", "Tek seferde koca bir video grubunu içe aktar"),
        social="• Dikey 9:16 video olarak dışa aktarır, her sosyal uygulamaya hazır",
        privacy="Videoların iPhone'unda düzenlenir ve asla yüklenmez. Hesap gerekmez.",
        filler="• Dolgu kelimeleri ve tekrarlanan çekimleri kaldırır",
        speech="Altyazılar, dolgu kelime ve tekrarlanan çekim temizleme İngilizce, İspanyolca, Fransızca, Almanca, İtalyanca ve Portekizce videolarda çalışır; sessizlik temizleme her dilde çalışır."),
    'uk': dict(
        batch=("Імпортуйте до десяти відео за раз", "Імпортуйте цілу пачку відео за раз"),
        social="• Експорт вертикального відео 9:16, готового для будь-якої соцмережі",
        privacy="Ваші відео монтуються на вашому iPhone і нікуди не завантажуються. Акаунт не потрібен.",
        filler="• Прибирає слова-паразити та повторні дублі",
        speech="Субтитри, видалення слів-паразитів і повторних дублів працюють для відео англійською, іспанською, французькою, німецькою, італійською та португальською; видалення тиші працює будь-якою мовою."),
    'ur-PK': dict(
        batch=("ایک ساتھ دس تک ویڈیوز امپورٹ کریں", "ایک ساتھ ویڈیوز کا پورا بیچ امپورٹ کریں"),
        social="• عمودی 9:16 ویڈیو ایکسپورٹ کرتا ہے، کسی بھی سوشل ایپ کے لیے تیار",
        privacy="آپ کی ویڈیوز آپ کے iPhone پر ہی ایڈٹ ہوتی ہیں اور کبھی اپ لوڈ نہیں ہوتیں۔ کسی اکاؤنٹ کی ضرورت نہیں۔",
        filler="• فضول الفاظ اور دہرائے گئے ٹیکس ہٹا دیتا ہے",
        speech="کیپشنز، فضول الفاظ اور دہرائے گئے ٹیکس ہٹانے کی سہولت انگریزی، ہسپانوی، فرانسیسی، جرمن، اطالوی اور پرتگالی ویڈیوز میں کام کرتی ہے؛ خاموشی ہٹانا کسی بھی زبان میں کام کرتا ہے۔"),
    'vi': dict(
        batch=("Nhập tối đa mười video cùng lúc", "Nhập cả một loạt video cùng lúc"),
        social="• Xuất video dọc 9:16, sẵn sàng cho mọi ứng dụng mạng xã hội",
        privacy="Video của bạn được chỉnh sửa ngay trên iPhone và không bao giờ bị tải lên. Không cần tài khoản.",
        filler="• Xóa từ đệm và các đoạn quay lặp lại",
        speech="Phụ đề, tính năng xóa từ đệm và xóa đoạn quay lặp lại hoạt động với video tiếng Anh, Tây Ban Nha, Pháp, Đức, Ý và Bồ Đào Nha; tính năng cắt khoảng lặng hoạt động với mọi ngôn ngữ."),
    'zh-Hans': dict(
        batch=("一次最多导入十段视频", "一次导入整批视频"),
        social="• 导出竖屏 9:16 视频，适合各大社交平台",
        privacy="你的视频在 iPhone 上完成剪辑，绝不上传。无需账号。",
        filler="• 去掉口头禅和重复的段落",
        speech="字幕、口头禅和重复段落的去除适用于英语、西班牙语、法语、德语、意大利语和葡萄牙语视频；去除静音适用于任何语言。"),
    'zh-Hant': dict(
        batch=("一次最多匯入十支影片", "一次匯入整批影片"),
        social="• 匯出直式 9:16 影片，適用各大社群平台",
        privacy="你的影片在 iPhone 上完成剪輯，絕不上傳。不需帳號。",
        filler="• 去除贅詞與重複的片段",
        speech="字幕、贅詞與重複片段的去除適用於英語、西班牙語、法語、德語、義大利語和葡萄牙語影片；去除靜音適用於任何語言。"),
}

SOCIAL_OLD = ('TikTok', 'Reels', 'Shorts')


def fix(loc, d):
    f = FIX[loc]
    desc = d['description']
    old, new = f['batch']
    assert desc.count(old) == 1, (loc, 'batch', desc.count(old))
    desc = desc.replace(old, new)
    ps = desc.split('\n\n')
    assert len(ps) == 8, (loc, 'paragraphs', len(ps))
    # 3: SAVE HOURS section, last line is the TikTok/Reels/Shorts bullet
    lines = ps[3].split('\n')
    assert all(w in lines[-1] for w in SOCIAL_OLD), (loc, 'social', lines[-1])
    lines[-1] = f['social']
    ps[3] = '\n'.join(lines)
    # 5: privacy section = heading line + one body line
    lines = ps[5].split('\n')
    assert len(lines) == 2 and 'iPhon' in lines[1], (loc, 'privacy', lines)
    ps[5] = lines[0] + '\n' + f['privacy']
    # 2: BULK section, line 3 is the filler-word bullet
    if 'filler' in f:
        lines = ps[2].split('\n')
        assert lines[3].startswith('•') and lines[3].count('"') + lines[3].count('“') + lines[3].count('«') + lines[3].count('„') + lines[3].count('»') + lines[3].count('「') >= 1, (loc, 'filler', lines[3])
        lines[3] = f['filler']
        ps[2] = '\n'.join(lines)
    if 'speech' in f:
        ps.insert(3, f['speech'])
    d['description'] = '\n\n'.join(ps)
    if 'keywords' in f:
        o, n = f['keywords']
        assert d['keywords'].count(o) == 1, (loc, 'keywords')
        d['keywords'] = d['keywords'].replace(o, n)
    return d


def write(path, d):
    with open(path, 'w') as fh:
        fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(x, ensure_ascii=False)}' for k, x in d.items()) + '\n}\n')


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    out = {}
    for loc in sorted(FIX):
        path = f'{D}/locales/{loc}.json'
        out[path] = fix(loc, json.load(open(path)))
    for path, d in out.items():
        loc = os.path.basename(path)[:-5]
        kw = [k for k in d['keywords'].split(',')]
        assert len(kw) == len(set(kw)), (loc, 'duplicate keyword')
        assert len(d['description']) <= 4000 and len(d['keywords']) <= 100 and len(d['promotionalText']) <= 170, loc
        print(f"{loc:8} desc {len(d['description']):4} kw {len(d['keywords']):3} (bytes {len(d['keywords'].encode()):3}) promo {len(d['promotionalText']):3}")
        if not dry:
            write(path, d)
    print('dry run' if dry else f'wrote {len(out)} locales')
