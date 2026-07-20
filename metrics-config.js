// BIYE.COM — Compatibility Metrics Config
// 113 metrics across 9 MIS-weighted categories + 1 optional (consent-based) social layer.
// Rule Engine (10% of MIS) reads the 'critical' category as hard gates.
// AI Engine (90% of MIS) reads all other categories as weighted signals.
var BIYE_METRICS = {
  "categories": [
    {
      "id": "identity",
      "bn": "পরিচয়",
      "en": "Identity",
      "color": "pink",
      "weight": 5
    },
    {
      "id": "education",
      "bn": "শিক্ষা ও ক্যারিয়ার",
      "en": "Education & Career",
      "color": "purple",
      "weight": 8
    },
    {
      "id": "personality",
      "bn": "ব্যক্তিত্ব",
      "en": "Personality",
      "color": "blue",
      "weight": 20
    },
    {
      "id": "family",
      "bn": "পরিবার ও সম্পর্ক",
      "en": "Family & Relationship",
      "color": "teal",
      "weight": 15
    },
    {
      "id": "lifestyle",
      "bn": "লাইফস্টাইল ও পছন্দ",
      "en": "Lifestyle & Preferences",
      "color": "green",
      "weight": 8
    },
    {
      "id": "health",
      "bn": "স্বাস্থ্য",
      "en": "Health",
      "color": "orange",
      "weight": 8
    },
    {
      "id": "values",
      "bn": "মূল্যবোধ",
      "en": "Values & Ethics",
      "color": "gold",
      "weight": 8
    },
    {
      "id": "future",
      "bn": "ভবিষ্যৎ পরিকল্পনা",
      "en": "Future Planning",
      "color": "pink-dark",
      "weight": 8
    },
    {
      "id": "critical",
      "bn": "ক্রিটিক্যাল ফ্ল্যাগ",
      "en": "Marriage-Critical Flags",
      "color": "purple-dark",
      "weight": 5,
      "ruleEngine": true
    },
    {
      "id": "preference",
      "bn": "পার্টনার পছন্দ",
      "en": "Partner Preference",
      "color": "crimson",
      "weight": 15,
      "special": true
    },
    {
      "id": "social",
      "bn": "সামাজিক সিগন্যাল (ঐচ্ছিক)",
      "en": "Social Signals (Optional)",
      "color": "grey",
      "weight": 0,
      "optional": true
    }
  ],
  "metrics": [
    {
      "id": "m001",
      "cat": "identity",
      "bn": "বয়স",
      "en": "Age",
      "type": "number",
      "min": 18,
      "max": 70,
      "unitBn": "বছর",
      "unitEn": "years"
    },
    {
      "id": "m002",
      "cat": "identity",
      "bn": "লিঙ্গ",
      "en": "Gender",
      "type": "select",
      "options": [
        {
          "bn": "পুরুষ",
          "en": "Male"
        },
        {
          "bn": "নারী",
          "en": "Female"
        }
      ]
    },
    {
      "id": "m003",
      "cat": "identity",
      "bn": "ধর্ম",
      "en": "Religion",
      "type": "select",
      "options": [
        {
          "bn": "ইসলাম",
          "en": "Islam"
        },
        {
          "bn": "হিন্দু",
          "en": "Hindu"
        },
        {
          "bn": "খ্রিস্টান",
          "en": "Christian"
        },
        {
          "bn": "বৌদ্ধ",
          "en": "Buddhist"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m004",
      "cat": "identity",
      "bn": "ধর্মীয় চর্চার মাত্রা",
      "en": "Religious practice level",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "নিয়মিত না",
      "loEn": "Not practicing",
      "hiBn": "অত্যন্ত নিয়মিত",
      "hiEn": "Very devout"
    },
    {
      "id": "m005",
      "cat": "identity",
      "bn": "জাতীয়তা",
      "en": "Nationality",
      "type": "select",
      "options": [
        {
          "bn": "বাংলাদেশি",
          "en": "Bangladeshi"
        },
        {
          "bn": "প্রবাসী",
          "en": "Expatriate"
        },
        {
          "bn": "দ্বৈত নাগরিক",
          "en": "Dual citizen"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m006",
      "cat": "identity",
      "bn": "এথনিসিটি",
      "en": "Ethnicity",
      "type": "text",
      "placeholderBn": "যেমন: বাঙালি",
      "placeholderEn": "e.g. Bengali"
    },
    {
      "id": "m007",
      "cat": "identity",
      "bn": "ভাষা",
      "en": "Languages",
      "type": "multiselect",
      "options": [
        {
          "bn": "বাংলা",
          "en": "Bengali"
        },
        {
          "bn": "ইংরেজি",
          "en": "English"
        },
        {
          "bn": "আরবি",
          "en": "Arabic"
        },
        {
          "bn": "হিন্দি",
          "en": "Hindi"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m008",
      "cat": "identity",
      "bn": "বসবাসের স্থান",
      "en": "Current residence",
      "type": "text",
      "placeholderBn": "শহর, দেশ",
      "placeholderEn": "City, country"
    },
    {
      "id": "m009",
      "cat": "identity",
      "bn": "অভিবাসন আগ্রহ",
      "en": "Immigration preference",
      "type": "select",
      "options": [
        {
          "bn": "দেশে থাকতে চাই",
          "en": "Prefer staying in home country"
        },
        {
          "bn": "বিদেশে যেতে আগ্রহী",
          "en": "Open to moving abroad"
        },
        {
          "bn": "ইতিমধ্যে প্রবাসী",
          "en": "Already abroad"
        }
      ]
    },
    {
      "id": "m010",
      "cat": "identity",
      "bn": "উচ্চতা",
      "en": "Height",
      "type": "number",
      "min": 130,
      "max": 210,
      "unitBn": "সেমি",
      "unitEn": "cm"
    },
    {
      "id": "m011",
      "cat": "identity",
      "bn": "ওজন",
      "en": "Weight",
      "type": "number",
      "min": 35,
      "max": 150,
      "unitBn": "কেজি",
      "unitEn": "kg"
    },
    {
      "id": "m012",
      "cat": "identity",
      "bn": "ব্লাড গ্রুপ",
      "en": "Blood group",
      "type": "select",
      "options": [
        {
          "bn": "A+",
          "en": "A+"
        },
        {
          "bn": "A-",
          "en": "A-"
        },
        {
          "bn": "B+",
          "en": "B+"
        },
        {
          "bn": "B-",
          "en": "B-"
        },
        {
          "bn": "AB+",
          "en": "AB+"
        },
        {
          "bn": "AB-",
          "en": "AB-"
        },
        {
          "bn": "O+",
          "en": "O+"
        },
        {
          "bn": "O-",
          "en": "O-"
        }
      ]
    },
    {
      "id": "m013",
      "cat": "identity",
      "bn": "পারিবারিক পটভূমি",
      "en": "Family background",
      "type": "text",
      "placeholderBn": "সংক্ষেপে লিখুন",
      "placeholderEn": "Briefly describe"
    },
    {
      "id": "m014",
      "cat": "education",
      "bn": "শিক্ষাগত যোগ্যতা",
      "en": "Education level",
      "type": "select",
      "options": [
        {
          "bn": "এসএসসি",
          "en": "SSC"
        },
        {
          "bn": "এইচএসসি",
          "en": "HSC"
        },
        {
          "bn": "স্নাতক",
          "en": "Bachelor's"
        },
        {
          "bn": "স্নাতকোত্তর",
          "en": "Master's"
        },
        {
          "bn": "পিএইচডি",
          "en": "PhD"
        }
      ]
    },
    {
      "id": "m015",
      "cat": "education",
      "bn": "বিশ্ববিদ্যালয়/প্রতিষ্ঠান",
      "en": "University / institution",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m016",
      "cat": "education",
      "bn": "পেশা",
      "en": "Profession",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m017",
      "cat": "education",
      "bn": "মাসিক আয়",
      "en": "Monthly income",
      "type": "select",
      "options": [
        {
          "bn": "৳২৫,০০০ এর নিচে",
          "en": "Below ৳25,000"
        },
        {
          "bn": "৳২৫,০০০–৫০,০০০",
          "en": "৳25,000–50,000"
        },
        {
          "bn": "৳৫০,০০০–১,০০,০০০",
          "en": "৳50,000–100,000"
        },
        {
          "bn": "৳১,০০,০০০+",
          "en": "৳100,000+"
        }
      ]
    },
    {
      "id": "m018",
      "cat": "education",
      "bn": "সঞ্চয়ের অভ্যাস",
      "en": "Savings habit",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "একদম না",
      "loEn": "Not at all",
      "hiBn": "নিয়মিত সঞ্চয়ী",
      "hiEn": "Consistently saves"
    },
    {
      "id": "m019",
      "cat": "education",
      "bn": "সম্পদের অবস্থা",
      "en": "Assets",
      "type": "select",
      "options": [
        {
          "bn": "নেই",
          "en": "None"
        },
        {
          "bn": "সীমিত",
          "en": "Limited"
        },
        {
          "bn": "মাঝারি",
          "en": "Moderate"
        },
        {
          "bn": "যথেষ্ট",
          "en": "Substantial"
        }
      ]
    },
    {
      "id": "m020",
      "cat": "education",
      "bn": "ক্যারিয়ার উচ্চাকাঙ্ক্ষা",
      "en": "Career ambition",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "নিম্ন",
      "loEn": "Low",
      "hiBn": "অত্যন্ত উচ্চাভিলাষী",
      "hiEn": "Highly ambitious"
    },
    {
      "id": "m021",
      "cat": "education",
      "bn": "ভবিষ্যতে আরও পড়াশোনার পরিকল্পনা",
      "en": "Plans for further study",
      "type": "boolean"
    },
    {
      "id": "m022",
      "cat": "education",
      "bn": "ব্যবসা শুরু করার আগ্রহ",
      "en": "Interested in starting a business",
      "type": "boolean"
    },
    {
      "id": "m023",
      "cat": "education",
      "bn": "কর্ম-জীবন ভারসাম্য অগ্রাধিকার",
      "en": "Work-life balance priority",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কাজই অগ্রাধিকার",
      "loEn": "Work comes first",
      "hiBn": "ভারসাম্য জরুরি",
      "hiEn": "Balance is essential"
    },
    {
      "id": "m024",
      "cat": "education",
      "bn": "অবসর পরিকল্পনা",
      "en": "Retirement goal",
      "type": "select",
      "options": [
        {
          "bn": "যত দ্রুত সম্ভব",
          "en": "As early as possible"
        },
        {
          "bn": "স্বাভাবিক বয়সে",
          "en": "At normal age"
        },
        {
          "bn": "যতদিন সম্ভব কাজ",
          "en": "Work as long as possible"
        }
      ]
    },
    {
      "id": "m025",
      "cat": "education",
      "bn": "নিয়মিত নতুন দক্ষতা শেখেন",
      "en": "Continuously learning new skills",
      "type": "boolean"
    },
    {
      "id": "m026",
      "cat": "education",
      "bn": "চাকরির স্থিতিশীলতা",
      "en": "Job stability",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "অস্থিতিশীল",
      "loEn": "Unstable",
      "hiBn": "অত্যন্ত স্থিতিশীল",
      "hiEn": "Very stable"
    },
    {
      "id": "m027",
      "cat": "education",
      "bn": "দ্বিতীয় আয়ের উৎস",
      "en": "Secondary income source",
      "type": "text",
      "placeholderBn": "যদি থাকে",
      "placeholderEn": "If any"
    },
    {
      "id": "m028",
      "cat": "personality",
      "bn": "অন্তর্মুখী vs বহির্মুখী",
      "en": "Introvert vs extrovert",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সম্পূর্ণ অন্তর্মুখী",
      "loEn": "Fully introvert",
      "hiBn": "সম্পূর্ণ বহির্মুখী",
      "hiEn": "Fully extrovert"
    },
    {
      "id": "m029",
      "cat": "personality",
      "bn": "নতুন অভিজ্ঞতার প্রতি খোলা মন",
      "en": "Openness to experience",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "প্রথাগত",
      "loEn": "Traditional",
      "hiBn": "অভিযাত্রী মন",
      "hiEn": "Very open"
    },
    {
      "id": "m030",
      "cat": "personality",
      "bn": "দায়িত্বশীলতা",
      "en": "Conscientiousness",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "শিথিল",
      "loEn": "Relaxed",
      "hiBn": "অত্যন্ত সংগঠিত",
      "hiEn": "Highly organized"
    },
    {
      "id": "m031",
      "cat": "personality",
      "bn": "সহনশীলতা",
      "en": "Agreeableness",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "প্রতিযোগিতামূলক",
      "loEn": "Competitive",
      "hiBn": "অত্যন্ত সহযোগী",
      "hiEn": "Very cooperative"
    },
    {
      "id": "m032",
      "cat": "personality",
      "bn": "মানসিক স্থিতিশীলতা",
      "en": "Emotional stability",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সংবেদনশীল",
      "loEn": "Sensitive",
      "hiBn": "স্থিতধী",
      "hiEn": "Very stable"
    },
    {
      "id": "m033",
      "cat": "personality",
      "bn": "নেতৃত্বগুণ",
      "en": "Leadership tendency",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "অনুসারী",
      "loEn": "Follower",
      "hiBn": "সহজাত নেতা",
      "hiEn": "Natural leader"
    },
    {
      "id": "m034",
      "cat": "personality",
      "bn": "ধৈর্য",
      "en": "Patience",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "অল্প ধৈর্য",
      "loEn": "Low patience",
      "hiBn": "অসীম ধৈর্য",
      "hiEn": "Very patient"
    },
    {
      "id": "m035",
      "cat": "personality",
      "bn": "সহানুভূতি",
      "en": "Empathy",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম",
      "loEn": "Low",
      "hiBn": "উচ্চ",
      "hiEn": "High"
    },
    {
      "id": "m036",
      "cat": "personality",
      "bn": "রাগের মাত্রা",
      "en": "Anger level",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "শান্ত স্বভাব",
      "loEn": "Calm",
      "hiBn": "দ্রুত রেগে যান",
      "hiEn": "Quick-tempered"
    },
    {
      "id": "m037",
      "cat": "personality",
      "bn": "ঝুঁকি নেওয়ার প্রবণতা",
      "en": "Risk-taking tendency",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "ঝুঁকি এড়িয়ে চলেন",
      "loEn": "Risk-averse",
      "hiBn": "ঝুঁকি নিতে পছন্দ করেন",
      "hiEn": "Risk-loving"
    },
    {
      "id": "m038",
      "cat": "personality",
      "bn": "সিদ্ধান্ত নেওয়ার ধরন",
      "en": "Decision-making style",
      "type": "select",
      "options": [
        {
          "bn": "যুক্তি দিয়ে",
          "en": "Logic-driven"
        },
        {
          "bn": "অনুভূতি দিয়ে",
          "en": "Emotion-driven"
        },
        {
          "bn": "দুটোর মিশ্রণ",
          "en": "A mix of both"
        }
      ]
    },
    {
      "id": "m039",
      "cat": "personality",
      "bn": "Attachment Style",
      "en": "Attachment style",
      "type": "select",
      "options": [
        {
          "bn": "নিরাপদ",
          "en": "Secure"
        },
        {
          "bn": "উদ্বিগ্ন",
          "en": "Anxious"
        },
        {
          "bn": "এড়িয়ে চলা",
          "en": "Avoidant"
        }
      ]
    },
    {
      "id": "m040",
      "cat": "personality",
      "bn": "যোগাযোগের ধরন",
      "en": "Communication style",
      "type": "select",
      "options": [
        {
          "bn": "সরাসরি",
          "en": "Direct"
        },
        {
          "bn": "কূটনৈতিক",
          "en": "Diplomatic"
        },
        {
          "bn": "সংরক্ষিত",
          "en": "Reserved"
        }
      ]
    },
    {
      "id": "m041",
      "cat": "personality",
      "bn": "দ্বন্দ্ব সমাধানের পদ্ধতি",
      "en": "Conflict resolution style",
      "type": "select",
      "options": [
        {
          "bn": "আলোচনা করে মেটান",
          "en": "Talk it out immediately"
        },
        {
          "bn": "সময় নিয়ে ভাবেন",
          "en": "Need time to process"
        },
        {
          "bn": "এড়িয়ে চলেন",
          "en": "Tend to avoid"
        }
      ]
    },
    {
      "id": "m042",
      "cat": "family",
      "bn": "যৌথ পরিবারে থাকার আগ্রহ",
      "en": "Joint family preference",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "একদম না",
      "loEn": "Not at all",
      "hiBn": "অবশ্যই চাই",
      "hiEn": "Strongly prefer"
    },
    {
      "id": "m043",
      "cat": "family",
      "bn": "সন্তান কতজন চান",
      "en": "Number of children desired",
      "type": "select",
      "options": [
        {
          "bn": "চাই না",
          "en": "None"
        },
        {
          "bn": "১",
          "en": "1"
        },
        {
          "bn": "২",
          "en": "2"
        },
        {
          "bn": "৩+",
          "en": "3+"
        },
        {
          "bn": "এখনো ভাবিনি",
          "en": "Undecided"
        }
      ]
    },
    {
      "id": "m044",
      "cat": "family",
      "bn": "বাবা-মায়ের প্রতি দায়িত্ব",
      "en": "Responsibility toward parents",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সীমিত",
      "loEn": "Limited",
      "hiBn": "সম্পূর্ণ দায়িত্ব",
      "hiEn": "Full responsibility"
    },
    {
      "id": "m045",
      "cat": "family",
      "bn": "জেন্ডার রোল প্রত্যাশা",
      "en": "Gender role expectations",
      "type": "select",
      "options": [
        {
          "bn": "প্রথাগত",
          "en": "Traditional"
        },
        {
          "bn": "সমতাভিত্তিক",
          "en": "Egalitarian"
        },
        {
          "bn": "নমনীয়",
          "en": "Flexible"
        }
      ]
    },
    {
      "id": "m046",
      "cat": "family",
      "bn": "পরিবারের ওপর নির্ভরশীলতা",
      "en": "Family dependency",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "স্বাধীন",
      "loEn": "Independent",
      "hiBn": "পরিবার-নির্ভর",
      "hiEn": "Family-dependent"
    },
    {
      "id": "m047",
      "cat": "family",
      "bn": "ঘরোয়া দায়িত্ব ভাগাভাগির প্রত্যাশা",
      "en": "Domestic responsibility sharing",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "একজন সামলাবে",
      "loEn": "One partner handles it",
      "hiBn": "সমান ভাগাভাগি",
      "hiEn": "Equal sharing"
    },
    {
      "id": "m048",
      "cat": "family",
      "bn": "বসবাসের স্থান পছন্দ",
      "en": "Living location preference",
      "type": "select",
      "options": [
        {
          "bn": "পরিবারের সাথে",
          "en": "With family"
        },
        {
          "bn": "আলাদা বাসা",
          "en": "Separate household"
        },
        {
          "bn": "নমনীয়",
          "en": "Flexible"
        }
      ]
    },
    {
      "id": "m049",
      "cat": "family",
      "bn": "প্রবাসে যাওয়ার আগ্রহ",
      "en": "Open to living abroad",
      "type": "boolean"
    },
    {
      "id": "m050",
      "cat": "family",
      "bn": "সম্পর্কের প্রত্যাশা",
      "en": "Relationship expectations",
      "type": "text",
      "placeholderBn": "সংক্ষেপে লিখুন",
      "placeholderEn": "Briefly describe"
    },
    {
      "id": "m051",
      "cat": "family",
      "bn": "Love Language",
      "en": "Love language",
      "type": "select",
      "options": [
        {
          "bn": "সময় কাটানো",
          "en": "Quality time"
        },
        {
          "bn": "প্রশংসার কথা",
          "en": "Words of affirmation"
        },
        {
          "bn": "উপহার",
          "en": "Gifts"
        },
        {
          "bn": "সাহায্য করা",
          "en": "Acts of service"
        },
        {
          "bn": "শারীরিক নৈকট্য",
          "en": "Physical touch"
        }
      ]
    },
    {
      "id": "m052",
      "cat": "lifestyle",
      "bn": "খাদ্যাভ্যাস",
      "en": "Food preference",
      "type": "select",
      "options": [
        {
          "bn": "সর্বভুক",
          "en": "Non-vegetarian"
        },
        {
          "bn": "নিরামিষাশী",
          "en": "Vegetarian"
        },
        {
          "bn": "হালাল-নিষ্ঠ",
          "en": "Strictly halal"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m053",
      "cat": "lifestyle",
      "bn": "ঘুমের প্যাটার্ন",
      "en": "Sleep pattern",
      "type": "select",
      "options": [
        {
          "bn": "সকাল-প্রিয়",
          "en": "Early bird"
        },
        {
          "bn": "রাত-প্রিয়",
          "en": "Night owl"
        }
      ]
    },
    {
      "id": "m054",
      "cat": "lifestyle",
      "bn": "ভ্রমণে আগ্রহ",
      "en": "Travel interest",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম আগ্রহী",
      "loEn": "Low interest",
      "hiBn": "ভ্রমণপ্রিয়",
      "hiEn": "Loves traveling"
    },
    {
      "id": "m055",
      "cat": "lifestyle",
      "bn": "শরীরচর্চার অভ্যাস",
      "en": "Exercise habit",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "অনিয়মিত",
      "loEn": "Irregular",
      "hiBn": "নিয়মিত",
      "hiEn": "Regular"
    },
    {
      "id": "m056",
      "cat": "lifestyle",
      "bn": "ফ্যাশন সচেতনতা",
      "en": "Fashion consciousness",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সাধারণ",
      "loEn": "Simple",
      "hiBn": "অত্যন্ত সচেতন",
      "hiEn": "Very conscious"
    },
    {
      "id": "m057",
      "cat": "lifestyle",
      "bn": "সোশ্যাল মিডিয়া ব্যবহার",
      "en": "Social media usage",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সামান্য",
      "loEn": "Minimal",
      "hiBn": "অতিরিক্ত",
      "hiEn": "Heavy user"
    },
    {
      "id": "m058",
      "cat": "lifestyle",
      "bn": "প্রযুক্তি ব্যবহারে স্বাচ্ছন্দ্য",
      "en": "Comfort with technology",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম",
      "loEn": "Low",
      "hiBn": "অত্যন্ত স্বাচ্ছন্দ্য",
      "hiEn": "Very comfortable"
    },
    {
      "id": "m059",
      "cat": "lifestyle",
      "bn": "খরচের অভ্যাস",
      "en": "Spending habit",
      "type": "select",
      "options": [
        {
          "bn": "সাশ্রয়ী",
          "en": "Frugal"
        },
        {
          "bn": "পরিমিত",
          "en": "Moderate"
        },
        {
          "bn": "উদার",
          "en": "Generous spender"
        }
      ]
    },
    {
      "id": "m060",
      "cat": "lifestyle",
      "bn": "সময় ব্যবস্থাপনা",
      "en": "Time management",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "শিথিল",
      "loEn": "Relaxed",
      "hiBn": "অত্যন্ত সময়নিষ্ঠ",
      "hiEn": "Very punctual"
    },
    {
      "id": "m061",
      "cat": "lifestyle",
      "bn": "বিনোদন পছন্দ",
      "en": "Entertainment preference",
      "type": "multiselect",
      "options": [
        {
          "bn": "সিনেমা",
          "en": "Movies"
        },
        {
          "bn": "সংগীত",
          "en": "Music"
        },
        {
          "bn": "বই",
          "en": "Books"
        },
        {
          "bn": "খেলাধুলা",
          "en": "Sports"
        },
        {
          "bn": "ভ্রমণ",
          "en": "Travel"
        }
      ]
    },
    {
      "id": "m062",
      "cat": "lifestyle",
      "bn": "প্রিয় খাবার",
      "en": "Favorite food",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m063",
      "cat": "lifestyle",
      "bn": "শখ",
      "en": "Hobbies",
      "type": "multiselect",
      "options": [
        {
          "bn": "রান্না",
          "en": "Cooking"
        },
        {
          "bn": "বাগান",
          "en": "Gardening"
        },
        {
          "bn": "লেখালেখি",
          "en": "Writing"
        },
        {
          "bn": "ছবি আঁকা",
          "en": "Painting"
        },
        {
          "bn": "গেমিং",
          "en": "Gaming"
        },
        {
          "bn": "ফটোগ্রাফি",
          "en": "Photography"
        }
      ]
    },
    {
      "id": "m064",
      "cat": "lifestyle",
      "bn": "পোষা প্রাণী পছন্দ",
      "en": "Likes pets",
      "type": "boolean"
    },
    {
      "id": "m065",
      "cat": "lifestyle",
      "bn": "সংগীতের ধরন",
      "en": "Music taste",
      "type": "multiselect",
      "options": [
        {
          "bn": "ক্লাসিক্যাল",
          "en": "Classical"
        },
        {
          "bn": "আধুনিক বাংলা",
          "en": "Modern Bangla"
        },
        {
          "bn": "পপ/রক",
          "en": "Pop/Rock"
        },
        {
          "bn": "ধর্মীয়",
          "en": "Devotional"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m066",
      "cat": "lifestyle",
      "bn": "বই পড়ার অভ্যাস",
      "en": "Reading habit",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম",
      "loEn": "Rarely reads",
      "hiBn": "নিয়মিত পাঠক",
      "hiEn": "Avid reader"
    },
    {
      "id": "m067",
      "cat": "lifestyle",
      "bn": "খেলাধুলার আগ্রহ",
      "en": "Sports interest",
      "type": "multiselect",
      "options": [
        {
          "bn": "ক্রিকেট",
          "en": "Cricket"
        },
        {
          "bn": "ফুটবল",
          "en": "Football"
        },
        {
          "bn": "ব্যাডমিন্টন",
          "en": "Badminton"
        },
        {
          "bn": "সাঁতার",
          "en": "Swimming"
        },
        {
          "bn": "কোনোটাই না",
          "en": "None"
        }
      ]
    },
    {
      "id": "m068",
      "cat": "lifestyle",
      "bn": "যোগাযোগের ফ্রিকোয়েন্সি প্রত্যাশা",
      "en": "Expected communication frequency",
      "type": "select",
      "options": [
        {
          "bn": "সারাদিন",
          "en": "Throughout the day"
        },
        {
          "bn": "দিনে কয়েকবার",
          "en": "A few times a day"
        },
        {
          "bn": "সন্ধ্যায়",
          "en": "Evenings"
        },
        {
          "bn": "প্রয়োজন অনুযায়ী",
          "en": "As needed"
        }
      ]
    },
    {
      "id": "m069",
      "cat": "lifestyle",
      "bn": "উৎসব পালনের ধরন",
      "en": "Festival celebration style",
      "type": "select",
      "options": [
        {
          "bn": "বড় করে উদযাপন",
          "en": "Big celebrations"
        },
        {
          "bn": "ঘরোয়াভাবে",
          "en": "Low-key at home"
        },
        {
          "bn": "নমনীয়",
          "en": "Flexible"
        }
      ]
    },
    {
      "id": "m070",
      "cat": "lifestyle",
      "bn": "ছুটি কাটানোর ধরন",
      "en": "Vacation style",
      "type": "select",
      "options": [
        {
          "bn": "অ্যাডভেঞ্চার",
          "en": "Adventure"
        },
        {
          "bn": "আরামদায়ক",
          "en": "Relaxing"
        },
        {
          "bn": "সাংস্কৃতিক ভ্রমণ",
          "en": "Cultural exploration"
        },
        {
          "bn": "পরিবার-কেন্দ্রিক",
          "en": "Family-focused"
        }
      ]
    },
    {
      "id": "m071",
      "cat": "health",
      "bn": "দীর্ঘস্থায়ী রোগ (যদি থাকে)",
      "en": "Chronic conditions (if any)",
      "type": "multiselect",
      "options": [
        {
          "bn": "ডায়াবেটিস",
          "en": "Diabetes"
        },
        {
          "bn": "উচ্চ রক্তচাপ",
          "en": "Hypertension"
        },
        {
          "bn": "থাইরয়েড",
          "en": "Thyroid"
        },
        {
          "bn": "হাঁপানি",
          "en": "Asthma"
        },
        {
          "bn": "কোনোটাই না",
          "en": "None"
        }
      ]
    },
    {
      "id": "m072",
      "cat": "health",
      "bn": "জেনেটিক/বংশগত রোগের ইতিহাস",
      "en": "Family history of genetic conditions",
      "type": "boolean"
    },
    {
      "id": "m073",
      "cat": "health",
      "bn": "উর্বরতাজনিত সমস্যা",
      "en": "Known fertility concerns",
      "type": "boolean"
    },
    {
      "id": "m074",
      "cat": "health",
      "bn": "মানসিক স্বাস্থ্যের অবস্থা (স্ব-মূল্যায়ন)",
      "en": "Mental wellbeing (self-rated)",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "চ্যালেঞ্জিং সময় যাচ্ছে",
      "loEn": "Currently struggling",
      "hiBn": "ভালো আছি",
      "hiEn": "Doing well"
    },
    {
      "id": "m075",
      "cat": "health",
      "bn": "আসক্তির ইতিহাস",
      "en": "Addiction history",
      "type": "select",
      "options": [
        {
          "bn": "কোনোটাই না",
          "en": "None"
        },
        {
          "bn": "অতীতে ছিল, এখন মুক্ত",
          "en": "In the past, now free"
        },
        {
          "bn": "বর্তমানে চলমান",
          "en": "Currently ongoing"
        }
      ]
    },
    {
      "id": "m076",
      "cat": "health",
      "bn": "ধূমপানের অভ্যাস",
      "en": "Smoking habit",
      "type": "select",
      "options": [
        {
          "bn": "করি না",
          "en": "Don't smoke"
        },
        {
          "bn": "মাঝেমধ্যে",
          "en": "Occasionally"
        },
        {
          "bn": "নিয়মিত",
          "en": "Regularly"
        }
      ]
    },
    {
      "id": "m077",
      "cat": "health",
      "bn": "মদ্যপানের অভ্যাস",
      "en": "Alcohol consumption",
      "type": "select",
      "options": [
        {
          "bn": "করি না",
          "en": "Don't drink"
        },
        {
          "bn": "মাঝেমধ্যে",
          "en": "Occasionally"
        },
        {
          "bn": "নিয়মিত",
          "en": "Regularly"
        }
      ]
    },
    {
      "id": "m078",
      "cat": "health",
      "bn": "শারীরিক প্রতিবন্ধকতা (যদি থাকে)",
      "en": "Physical disability (if any)",
      "type": "boolean"
    },
    {
      "id": "m079",
      "cat": "health",
      "bn": "স্বাস্থ্য সচেতনতা",
      "en": "Health consciousness",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম মনোযোগ",
      "loEn": "Low attention",
      "hiBn": "অত্যন্ত সচেতন",
      "hiEn": "Highly conscious"
    },
    {
      "id": "m080",
      "cat": "health",
      "bn": "পারিবারিক মেডিকেল হিস্ট্রি",
      "en": "Family medical history",
      "type": "text",
      "placeholderBn": "সংক্ষেপে",
      "placeholderEn": "Briefly describe"
    },
    {
      "id": "m081",
      "cat": "health",
      "bn": "দীর্ঘমেয়াদী স্বাস্থ্য লক্ষ্য",
      "en": "Long-term health goal",
      "type": "select",
      "options": [
        {
          "bn": "সক্রিয় দীর্ঘায়ু চাই",
          "en": "Want an active, long life"
        },
        {
          "bn": "স্বাভাবিক",
          "en": "No specific goal"
        },
        {
          "bn": "এখনো ভাবিনি",
          "en": "Haven't thought about it"
        }
      ]
    },
    {
      "id": "m082",
      "cat": "values",
      "bn": "রাজনৈতিক আলোচনায় আগ্রহ",
      "en": "Interest in political discussion",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "আগ্রহী না",
      "loEn": "Not interested",
      "hiBn": "নিয়মিত আলোচনা করি",
      "hiEn": "Regularly engaged"
    },
    {
      "id": "m083",
      "cat": "values",
      "bn": "দাতব্য/সমাজসেবায় সম্পৃক্ততা",
      "en": "Charity/social work involvement",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "জড়িত না",
      "loEn": "Not involved",
      "hiBn": "নিয়মিত জড়িত",
      "hiEn": "Regularly involved"
    },
    {
      "id": "m084",
      "cat": "values",
      "bn": "পরিবেশ সচেতনতা",
      "en": "Environmental consciousness",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "কম",
      "loEn": "Low",
      "hiBn": "অত্যন্ত সচেতন",
      "hiEn": "Highly conscious"
    },
    {
      "id": "m085",
      "cat": "values",
      "bn": "সততাকে অগ্রাধিকার",
      "en": "Priority on honesty",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "পরিস্থিতি অনুযায়ী",
      "loEn": "Situational",
      "hiBn": "সর্বদা সৎ থাকা জরুরি",
      "hiEn": "Always essential"
    },
    {
      "id": "m086",
      "cat": "values",
      "bn": "সামাজিক মর্যাদার গুরুত্ব",
      "en": "Importance of social status",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "গুরুত্বপূর্ণ না",
      "loEn": "Not important",
      "hiBn": "খুবই গুরুত্বপূর্ণ",
      "hiEn": "Very important"
    },
    {
      "id": "m087",
      "cat": "values",
      "bn": "গোপনীয়তা পছন্দ",
      "en": "Privacy preference",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "খোলামেলা",
      "loEn": "Open book",
      "hiBn": "অত্যন্ত ব্যক্তিগত",
      "hiEn": "Very private"
    },
    {
      "id": "m088",
      "cat": "values",
      "bn": "ব্যক্তিস্বাধীনতার গুরুত্ব",
      "en": "Importance of personal freedom",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "আপোষযোগ্য",
      "loEn": "Flexible",
      "hiBn": "অ-আপোষযোগ্য",
      "hiEn": "Non-negotiable"
    },
    {
      "id": "m089",
      "cat": "values",
      "bn": "নৈতিক মূল্যবোধের বর্ণনা",
      "en": "Describe your core values",
      "type": "text",
      "placeholderBn": "সংক্ষেপে",
      "placeholderEn": "Briefly"
    },
    {
      "id": "m090",
      "cat": "values",
      "bn": "সন্তানের জন্য ধর্মীয় শিক্ষার গুরুত্ব",
      "en": "Importance of religious upbringing for children",
      "type": "select",
      "options": [
        {
          "bn": "অত্যন্ত গুরুত্বপূর্ণ",
          "en": "Very important"
        },
        {
          "bn": "কিছুটা",
          "en": "Somewhat"
        },
        {
          "bn": "গুরুত্বপূর্ণ না",
          "en": "Not important"
        }
      ]
    },
    {
      "id": "m091",
      "cat": "future",
      "bn": "বাড়ি কেনার পরিকল্পনা",
      "en": "Plans to buy a home",
      "type": "boolean"
    },
    {
      "id": "m092",
      "cat": "future",
      "bn": "বিনিয়োগ ধরন",
      "en": "Investment style",
      "type": "select",
      "options": [
        {
          "bn": "রক্ষণশীল",
          "en": "Conservative"
        },
        {
          "bn": "মাঝারি ঝুঁকি",
          "en": "Moderate risk"
        },
        {
          "bn": "উচ্চ ঝুঁকি",
          "en": "High risk"
        }
      ]
    },
    {
      "id": "m093",
      "cat": "future",
      "bn": "নিজের ব্যবসা শুরুর স্বপ্ন",
      "en": "Dream of starting own business",
      "type": "boolean"
    },
    {
      "id": "m094",
      "cat": "future",
      "bn": "সন্তানের শিক্ষা নিয়ে ভাবনা",
      "en": "Vision for children's education",
      "type": "select",
      "options": [
        {
          "bn": "দেশীয় শিক্ষা",
          "en": "Local education"
        },
        {
          "bn": "বিদেশে পড়াশোনা",
          "en": "Study abroad"
        },
        {
          "bn": "এখনো ভাবিনি",
          "en": "Haven't decided"
        }
      ]
    },
    {
      "id": "m095",
      "cat": "future",
      "bn": "পছন্দের দেশ (বসবাসের জন্য)",
      "en": "Preferred country to live in",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m096",
      "cat": "future",
      "bn": "অবসরের পরিকল্পিত স্থান",
      "en": "Planned retirement location",
      "type": "select",
      "options": [
        {
          "bn": "নিজের শহরে",
          "en": "Home city"
        },
        {
          "bn": "গ্রামে",
          "en": "Village/countryside"
        },
        {
          "bn": "বিদেশে",
          "en": "Abroad"
        },
        {
          "bn": "এখনো ভাবিনি",
          "en": "Undecided"
        }
      ]
    },
    {
      "id": "m097",
      "cat": "future",
      "bn": "উদ্যোক্তা মানসিকতা",
      "en": "Entrepreneurial mindset",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "চাকরি-নির্ভর",
      "loEn": "Prefers stable job",
      "hiBn": "উদ্যোক্তা হতে চাই",
      "hiEn": "Wants to build something"
    },
    {
      "id": "m098",
      "cat": "future",
      "bn": "সামাজিক প্রভাব রাখার আগ্রহ",
      "en": "Interest in social impact/mission",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "আগ্রহী না",
      "loEn": "Not a priority",
      "hiBn": "জীবনের লক্ষ্য",
      "hiEn": "Core life goal"
    },
    {
      "id": "m099",
      "cat": "future",
      "bn": "ডিজিটাল/স্মার্ট লাইফস্টাইলের প্রতি আগ্রহ",
      "en": "Interest in digital/smart lifestyle",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "প্রথাগত জীবনযাপন",
      "loEn": "Traditional living",
      "hiBn": "প্রযুক্তি-কেন্দ্রিক",
      "hiEn": "Tech-forward living"
    },
    {
      "id": "m100",
      "cat": "future",
      "bn": "AI ও নতুন প্রযুক্তি গ্রহণযোগ্যতা",
      "en": "Acceptance of AI & new technology",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "দ্বিধাগ্রস্ত",
      "loEn": "Hesitant",
      "hiBn": "সাদরে গ্রহণ করি",
      "hiEn": "Embraces it"
    },
    {
      "id": "m101",
      "cat": "critical",
      "bn": "বিবাহবিচ্ছেদের ইতিহাস",
      "en": "Divorce history",
      "type": "boolean"
    },
    {
      "id": "m102",
      "cat": "critical",
      "bn": "আগের কোনো সম্পর্কের ইতিহাস আছে",
      "en": "Prior serious relationship history",
      "type": "boolean"
    },
    {
      "id": "m103",
      "cat": "critical",
      "bn": "ঋণের অবস্থা",
      "en": "Debt status",
      "type": "select",
      "options": [
        {
          "bn": "ঋণমুক্ত",
          "en": "Debt-free"
        },
        {
          "bn": "সামান্য ঋণ",
          "en": "Minor debt"
        },
        {
          "bn": "উল্লেখযোগ্য ঋণ",
          "en": "Significant debt"
        }
      ]
    },
    {
      "id": "m104",
      "cat": "critical",
      "bn": "ক্রিমিনাল রেকর্ড ভেরিফিকেশনে সম্মতি",
      "en": "Consents to criminal record verification",
      "type": "boolean"
    },
    {
      "id": "m105",
      "cat": "critical",
      "bn": "পারিবারিক মেডিকেল হিস্ট্রি (ঝুঁকিপূর্ণ, যদি থাকে)",
      "en": "Family medical history (high-risk, if any)",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m106",
      "cat": "critical",
      "bn": "কম্প্যাটিবিলিটি অগ্রাধিকার (নিজের ভাষায়)",
      "en": "Compatibility priorities (in your own words)",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m107",
      "cat": "critical",
      "bn": "রেড ফ্ল্যাগ যা এড়াতে চান",
      "en": "Red flags you want to avoid",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m108",
      "cat": "critical",
      "bn": "অ-আপোষযোগ্য শর্ত",
      "en": "Non-negotiable conditions",
      "type": "text",
      "placeholderBn": "",
      "placeholderEn": ""
    },
    {
      "id": "m109",
      "cat": "critical",
      "bn": "বিয়ের জন্য প্রস্তুতি (স্ব-মূল্যায়ন)",
      "en": "Marriage readiness (self-rated)",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "প্রস্তুত না",
      "loEn": "Not ready",
      "hiBn": "সম্পূর্ণ প্রস্তুত",
      "hiEn": "Fully ready"
    },
    {
      "id": "m110",
      "cat": "critical",
      "bn": "সাইকোলজিক্যাল অ্যাসেসমেন্ট সম্পন্ন করতে সম্মত",
      "en": "Willing to complete a psychological assessment",
      "type": "boolean"
    },
    {
      "id": "m111",
      "cat": "social",
      "bn": "সোশ্যাল মিডিয়া প্রোফাইল সংযুক্ত করতে সম্মত (ঐচ্ছিক)",
      "en": "Consents to linking social media profiles (optional)",
      "type": "boolean"
    },
    {
      "id": "m112",
      "cat": "social",
      "bn": "ডিজিটাল রেপুটেশন স্ব-মূল্যায়ন",
      "en": "Self-rated digital reputation",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সচেতন না",
      "loEn": "Not conscious of it",
      "hiBn": "অত্যন্ত সচেতন",
      "hiEn": "Very conscious"
    },
    {
      "id": "m113",
      "cat": "social",
      "bn": "কমিউনিটি সম্পৃক্ততা",
      "en": "Community involvement",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সীমিত",
      "loEn": "Limited",
      "hiBn": "সক্রিয়ভাবে জড়িত",
      "hiEn": "Actively involved"
    },
    {
      "id": "m114",
      "cat": "identity",
      "bn": "গায়ের রঙ/অ্যাপিয়ারেন্স",
      "en": "Complexion / appearance",
      "type": "select",
      "options": [
        {
          "bn": "ফর্সা",
          "en": "Fair"
        },
        {
          "bn": "উজ্জ্বল শ্যামলা",
          "en": "Wheatish"
        },
        {
          "bn": "শ্যামলা",
          "en": "Medium"
        },
        {
          "bn": "গাঢ়",
          "en": "Dark"
        }
      ]
    },
    {
      "id": "m115",
      "cat": "education",
      "bn": "পেশার ক্যাটাগরি",
      "en": "Profession category",
      "type": "select",
      "options": [
        {
          "bn": "ডাক্তার",
          "en": "Doctor"
        },
        {
          "bn": "ইঞ্জিনিয়ার",
          "en": "Engineer"
        },
        {
          "bn": "শিক্ষক/অধ্যাপক",
          "en": "Teacher/Academic"
        },
        {
          "bn": "ব্যবসায়ী",
          "en": "Business"
        },
        {
          "bn": "সরকারি চাকরি",
          "en": "Government service"
        },
        {
          "bn": "বেসরকারি চাকরি",
          "en": "Private service"
        },
        {
          "bn": "প্রবাসে কর্মরত",
          "en": "Working abroad"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m116",
      "cat": "identity",
      "bn": "দাড়ি রাখেন (শুধু পুরুষদের জন্য প্রযোজ্য)",
      "en": "Has a beard (applicable for male profiles)",
      "type": "boolean"
    },
    {
      "id": "m117",
      "cat": "identity",
      "bn": "শহর",
      "en": "City",
      "type": "select",
      "options": [
        {
          "bn": "ঢাকা",
          "en": "Dhaka"
        },
        {
          "bn": "চট্টগ্রাম",
          "en": "Chattogram"
        },
        {
          "bn": "সিলেট",
          "en": "Sylhet"
        },
        {
          "bn": "খুলনা",
          "en": "Khulna"
        },
        {
          "bn": "রাজশাহী",
          "en": "Rajshahi"
        },
        {
          "bn": "বরিশাল",
          "en": "Barishal"
        },
        {
          "bn": "কুমিল্লা",
          "en": "Cumilla"
        },
        {
          "bn": "অন্যান্য",
          "en": "Other"
        }
      ]
    },
    {
      "id": "m118",
      "cat": "identity",
      "bn": "বর্তমানে দেশে নাকি বিদেশে থাকেন",
      "en": "Currently residing in-country or abroad",
      "type": "select",
      "options": [
        {
          "bn": "দেশে",
          "en": "In-country"
        },
        {
          "bn": "বিদেশে",
          "en": "Abroad"
        }
      ]
    },
    {
      "id": "m119",
      "cat": "identity",
      "bn": "প্রবাসী/ডায়াস্পোরা (বিদেশে বেড়ে ওঠা)",
      "en": "Diaspora (raised abroad)",
      "type": "boolean"
    },
    {
      "id": "m120",
      "cat": "future",
      "bn": "নিজের বাসস্থান আছে",
      "en": "Owns own residence/home",
      "type": "boolean"
    },
    {
      "id": "m121",
      "cat": "family",
      "bn": "সন্তান আছে (আগের সম্পর্ক থেকে, যদি থাকে)",
      "en": "Has children (from a previous relationship, if any)",
      "type": "boolean"
    },
    {
      "id": "m122",
      "cat": "family",
      "bn": "বর্তমান পারিবারিক কাঠামো",
      "en": "Current family living structure",
      "type": "select",
      "options": [
        {
          "bn": "বাবা-মায়ের সাথে",
          "en": "With parents"
        },
        {
          "bn": "নিউক্লিয়ার পরিবার",
          "en": "Nuclear family"
        },
        {
          "bn": "যৌথ পরিবার",
          "en": "Joint family"
        },
        {
          "bn": "একা থাকেন",
          "en": "Living alone"
        }
      ]
    },
    {
      "id": "m123",
      "cat": "preference",
      "bn": "পছন্দের উচ্চতা",
      "en": "Preferred height",
      "type": "number",
      "min": 130,
      "max": 210,
      "unitBn": "সেমি",
      "unitEn": "cm"
    },
    {
      "id": "m124",
      "cat": "preference",
      "bn": "পছন্দের ওজন",
      "en": "Preferred weight",
      "type": "number",
      "min": 35,
      "max": 150,
      "unitBn": "কেজি",
      "unitEn": "kg"
    },
    {
      "id": "m125",
      "cat": "preference",
      "bn": "পছন্দের গায়ের রঙ/অ্যাপিয়ারেন্স",
      "en": "Preferred complexion / appearance",
      "type": "select",
      "options": [
        {
          "bn": "ফর্সা",
          "en": "Fair"
        },
        {
          "bn": "উজ্জ্বল শ্যামলা",
          "en": "Wheatish"
        },
        {
          "bn": "শ্যামলা",
          "en": "Medium"
        },
        {
          "bn": "গাঢ়",
          "en": "Dark"
        },
        {
          "bn": "কোনো পছন্দ নেই",
          "en": "No preference"
        }
      ]
    },
    {
      "id": "m126",
      "cat": "preference",
      "bn": "পছন্দের ন্যূনতম শিক্ষাগত যোগ্যতা",
      "en": "Preferred minimum education",
      "type": "select",
      "options": [
        {
          "bn": "এসএসসি",
          "en": "SSC"
        },
        {
          "bn": "এইচএসসি",
          "en": "HSC"
        },
        {
          "bn": "স্নাতক",
          "en": "Bachelor's"
        },
        {
          "bn": "স্নাতকোত্তর",
          "en": "Master's"
        },
        {
          "bn": "পিএইচডি",
          "en": "PhD"
        }
      ]
    },
    {
      "id": "m127",
      "cat": "preference",
      "bn": "পার্টনারের জন্য পছন্দের ধর্ম",
      "en": "Preferred religion for partner",
      "type": "select",
      "options": [
        {
          "bn": "ইসলাম",
          "en": "Islam"
        },
        {
          "bn": "হিন্দু",
          "en": "Hindu"
        },
        {
          "bn": "খ্রিস্টান",
          "en": "Christian"
        },
        {
          "bn": "বৌদ্ধ",
          "en": "Buddhist"
        },
        {
          "bn": "যেকোনো",
          "en": "Any"
        }
      ]
    },
    {
      "id": "m128",
      "cat": "preference",
      "bn": "পছন্দের পেশার ক্যাটাগরি",
      "en": "Preferred profession category",
      "type": "select",
      "options": [
        {
          "bn": "ডাক্তার",
          "en": "Doctor"
        },
        {
          "bn": "ইঞ্জিনিয়ার",
          "en": "Engineer"
        },
        {
          "bn": "শিক্ষক/অধ্যাপক",
          "en": "Teacher/Academic"
        },
        {
          "bn": "ব্যবসায়ী",
          "en": "Business"
        },
        {
          "bn": "সরকারি চাকরি",
          "en": "Government service"
        },
        {
          "bn": "বেসরকারি চাকরি",
          "en": "Private service"
        },
        {
          "bn": "প্রবাসে কর্মরত",
          "en": "Working abroad"
        },
        {
          "bn": "কোনো পছন্দ নেই",
          "en": "No preference"
        }
      ]
    },
    {
      "id": "m129",
      "cat": "preference",
      "bn": "পার্টনার কেমন হোক: অন্তর্মুখী vs বহির্মুখী",
      "en": "Preferred partner: introvert vs extrovert",
      "type": "scale",
      "min": 1,
      "max": 5,
      "loBn": "সম্পূর্ণ অন্তর্মুখী",
      "loEn": "Fully introvert",
      "hiBn": "সম্পূর্ণ বহির্মুখী",
      "hiEn": "Fully extrovert"
    },
    {
      "id": "m130",
      "cat": "preference",
      "bn": "পার্টনারের দাড়ি থাকা পছন্দ (পুরুষ পার্টনারের ক্ষেত্রে প্রযোজ্য)",
      "en": "Prefers a partner with a beard (where applicable)",
      "type": "boolean"
    },
    {
      "id": "m131",
      "cat": "preference",
      "bn": "পছন্দের শহর",
      "en": "Preferred city",
      "type": "select",
      "options": [
        {
          "bn": "ঢাকা",
          "en": "Dhaka"
        },
        {
          "bn": "চট্টগ্রাম",
          "en": "Chattogram"
        },
        {
          "bn": "সিলেট",
          "en": "Sylhet"
        },
        {
          "bn": "খুলনা",
          "en": "Khulna"
        },
        {
          "bn": "রাজশাহী",
          "en": "Rajshahi"
        },
        {
          "bn": "বরিশাল",
          "en": "Barishal"
        },
        {
          "bn": "কুমিল্লা",
          "en": "Cumilla"
        },
        {
          "bn": "কোনো পছন্দ নেই",
          "en": "No preference"
        }
      ]
    },
    {
      "id": "m132",
      "cat": "preference",
      "bn": "পার্টনার দেশে নাকি বিদেশে থাকুক",
      "en": "Prefer partner residing in-country or abroad",
      "type": "select",
      "options": [
        {
          "bn": "দেশে",
          "en": "In-country"
        },
        {
          "bn": "বিদেশে",
          "en": "Abroad"
        },
        {
          "bn": "কোনো পছন্দ নেই",
          "en": "No preference"
        }
      ]
    },
    {
      "id": "m133",
      "cat": "preference",
      "bn": "প্রবাসী/ডায়াস্পোরা পার্টনার গ্রহণযোগ্য",
      "en": "Diaspora partner acceptable",
      "type": "boolean"
    },
    {
      "id": "m134",
      "cat": "preference",
      "bn": "পার্টনারের নিজের বাসস্থান থাকা জরুরি",
      "en": "Partner owning a home is important",
      "type": "boolean"
    },
    {
      "id": "m135",
      "cat": "preference",
      "bn": "আগে বিবাহিত ছিলেন এমন পার্টনার (বিধবা/তালাকপ্রাপ্ত) গ্রহণযোগ্য",
      "en": "Previously-married partner (widowed/divorced) acceptable",
      "type": "boolean"
    },
    {
      "id": "m136",
      "cat": "preference",
      "bn": "সন্তান আছে এমন পার্টনার গ্রহণযোগ্য",
      "en": "Partner who already has children is acceptable",
      "type": "boolean"
    },
    {
      "id": "m137",
      "cat": "preference",
      "bn": "পার্টনারের পারিবারিক কাঠামো নিয়ে পছন্দ",
      "en": "Preferred family living structure for partner",
      "type": "select",
      "options": [
        {
          "bn": "বাবা-মায়ের সাথে",
          "en": "With parents"
        },
        {
          "bn": "নিউক্লিয়ার পরিবার",
          "en": "Nuclear family"
        },
        {
          "bn": "যৌথ পরিবার",
          "en": "Joint family"
        },
        {
          "bn": "কোনো পছন্দ নেই",
          "en": "No preference"
        }
      ]
    }
  ]
};
if (typeof module !== 'undefined' && module.exports) { module.exports = BIYE_METRICS; }
