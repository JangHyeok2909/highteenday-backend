# Awesome-CV 샘플 — 당근페이 창립 SRE의 영문 이력서 (국내 인물, 해외 형식)

> **확보일** 2026-09-07 · **원문 언어** 영어 · **저장 범위** 섹션 순서, 요약 문단, 경력 불릿 전문, 수상 형식. 전화·이메일·주소는 옮기지 않았다.
>
> | 출처 | 주소 | 확보 방법 |
> |---|---|---|
> | 템플릿 저장소 | https://github.com/posquit0/Awesome-CV | gh api. 스타 28,437 (2026-09-07), 마지막 푸시 2026-08-13 |
> | 샘플 이력서 소스 | `examples/resume.tex`, `examples/resume/{summary,experience,honors,education}.tex` | curl (raw) |
>
> **"해외 레퍼런스" 기준의 예외다.** 저자 Byungjin Park(posquit0)은 서울 거주 한국인이다. 그런데도 넣은 이유 둘: ① 이 템플릿은 스타 2만 8천으로 여기 모은 템플릿 중 가장 널리 쓰이는 **국제 표준 형식**이고 샘플이 영어다. ② 샘플이 **당근마켓 SRE와 당근페이 창립 인프라 리드의 실제 경력**이라, 지금 지원 타겟([../../daangn/daangn-feed-infra.md](../../daangn/daangn-feed-infra.md))의 인프라 조직이 어떤 일을 어떤 문장으로 적는지 보여준다. 다른 여섯 레퍼런스가 형식의 근거라면 이 문서는 **내용(도메인 어휘)의 근거**다.

## 누구인가

DevOps Engineer · Software Architect. POSTECH 컴퓨터공학(2010~2017). Dunamu DevOps(2023~2024), **당근페이 창립 멤버 · SRE · 인프라팀 리드(2021~2023)**, **당근마켓 SRE(2021)**, Kasa 창립 멤버 · 인프라 디렉터(2018~2021), Omnious 소프트웨어 아키텍트(2017~2018), PLAT 공동창업(2016~2017), 국군사이버사령부(2014~2016). DEFCON CTF 결선 5회.

---

## 1. 뼈대

**머리글**: 이름 / 직함 두 개(`DevOps Engineer · Software Architect`) / 주소 · 전화 · 이메일 · 홈페이지 · GitHub · LinkedIn / 인용문 한 줄(*"Be the change that you want to see in the world."*)

**섹션 순서**: Summary → Work Experience → Honors & Awards → Certificates → Education. (템플릿이 제공하지만 이 샘플에서 끈 것: Presentation, Writing, Committees, Extracurricular)

**경력 항목 형식**: `직함` / `회사` / `도시, 국가` / `기간(Mon. YYYY - Mon. YYYY)` / 불릿. 주력 경력은 불릿 7~9개, 짧은 경력은 1~3개, 한 달짜리(당근마켓 SRE)는 **불릿 없이 제목만**.

## 2. Summary 원문

> Seasoned SRE/DevOps leader currently on a career sabbatical cherishing family moments, seeking high-impact opportunities in fast-growing start-up companies. With 15+ years of hands-on software engineering expertise — specializing in service architecture, DevOps & SRE practices, infrastructure operations, and security engineering — proven in scaling infrastructure teams as lead engineer and founding member at two fintech companies. Delivered technical advisory and consulting for DeFi, AI, and B2B SaaS startups, optimizing cloud-native architectures (AWS multi-account, Kubernetes, Terraform) for reliability and scalability.
>
> Passionate to contribute to open-source projects and tech communities through knowledge sharing knowledge and experience. Big fan of terminal-centric workflows on macOS with zsh, Tmux, NeoVim, and chezmoi; relentlessly optimizes personal setups and experiments with Claude Code-powered AI workflows to tackle complex challenges faster.

## 3. Work Experience 원문

**DevOps Engineer · Dunamu Inc. · Seoul · Sep. 2023 - Mar. 2024**
- Led service mesh technology research and implementation across enterprise cross-cluster environments, evaluating Istio, Cilium, Kuma, Consul, and AWS VPC Lattice for enhanced security and scalability.
- Designed Terraform modules to efficiently manage and scale infrastructure across dozens of AWS accounts, enabling standardized, repeatable deployments.

**Founding Member & Site Reliability Engineer & Infrastructure Team Lead · Danggeun Pay Inc. (KarrotPay) · Seoul · Mar. 2021 - Jun. 2023**
- Everything that matters.
- Designed and provisioned the entire infrastructure on the AWS cloud to meet security compliance and acquire a business license for financial services in Korea.
- Continuously improved the infrastructure architecture since launching the service. (currently 3.6 million users)
- Established a standardized base for declarative management of infrastructures and service deployments, enabling operational efficiency and consistency. Over 90% of AWS resources were all managed through standardized terraform modules. All add-ons and service workloads on the Kubernetes cluster were managed on a GitOps basis with Kustomize and ArgoCD.
- Saved over 30% of the overall AWS costs by establishing a quarterly purchasing strategiy for RI (Reserved Instance) and SP (Savings Plan) and by introducing Graviton instances.
- Established a core architecture for regulating of outbound DNS traffic in multi-account and multi-VPC environments utilizing AWS Route53 DNS Firewall and FMS. This significantly increased the level of security confidence in the financial sector's segregated environment.
- Introduced Okta employee identity solution in the company, establishing security policies and configuring SSO integration with over 20 enterprise systems including AWS, GitHub, Slack, Google Workspace. Set up a Hub and Spoke architecture, enabling a collaborative account structure with the parent company, Daangn Market.

**Site Reliability Engineer · Danggeun Market Inc. · Seoul · Feb. 2021 - Mar. 2021** (불릿 없음)

**Founding Member & Director of Infrastructure Division · Kasa · Seoul · Jun. 2018 - Jan. 2021**
- Designed on-boarding process to guide new engineers, help them to focus on the right tasks, and set expectations to help them be successful at Infrastructure team.
- Migrated the orchestration system from DC/OS to Kubernetes which is based on AWS EKS. Managed 3 Kubernetes clusters and 300+ pods. Managed all Kubernetes manifests declaratively with Kustomize and ArgoCD.
- Designed and managed complex network configurations on AWS with 4 VPC and 100+ subnets. Separated the development network and operation network according to financial regulations. Established dedicated network connections from AWS VPC to partners' on-premise network based on AWS Direct Connect with secure connection using IPsec VPN. Provisioned OpenVPN servers with LDAP integration.
- Provisioned a observability system with Kafka, Elastic Stack(Filebeat, Heartbeat, APM Server, Logstash, Elasticsearch, Kibana). Collected log, uptime, tracing data from hosts, containers, pods and more. The ES cluster which has 9 nodes processed more than 1 billion documents per month. Wrote Terraform module to easily provision ES cluster on AWS EC2 instances.
- Provisioned a monitoring system with Kafka, Telegraf, InfluxDB, Grafana. Collected metrics from hosts, containers, pods and more. Wrote Terraform module to easily provision InfluxDB with HA on AWS EC2 instances.
- Introduced Kong API Gateway to easily connect all API microservices with a declarative management method based on Terraform and Atlantis to collaborate and audit change history.
- Provisioned the Directory Service for employee identity management based on OpenLDAP which guarantees HA with multi-master replication.
- Implemented Worker microservices consuming Kafka event topics for email, SMS, Kakaotalk and Slack notification. Developed in-house framework to easily build Kafka consumer microservice with common features including retry on failure, DLQ(Dead Letter Queue), event routing and more.
- Introduced Elastic APM to help distributed tracing, trouble-shooting and performance testing in MSA.

**Software Architect · Omnious. Co., Ltd. · Seoul · Jun. 2017 - May. 2018**
- Provisioned an easily managable hybrid infrastructure(Amazon AWS + On-premise) utilizing IaC(Infrastructure as Code) tools like Ansible, Packer and Terraform.
- Built fully automated CI/CD pipelines on CircleCI for containerized applications using Docker, AWS ECR and Rancher.
- Designed an overall service architecture and pipelines of the Machine Learning based Fashion Tagging API SaaS product with the micro-services architecture.
- Implemented several API microservices in Node.js Koa and in the serverless AWS Lambda functions.
- Deployed a centralized logging environment(ELK, Filebeat, CloudWatch, S3) which gather log data from docker containers and AWS resources.
- Deployed a centralized monitoring environment(Grafana, InfluxDB, CollectD) which gather system metrics as well as docker run-time metrics.

**Co-founder & Software Engineer · PLAT Corp. · Seoul · Jan. 2016 - Jun. 2017**
- Implemented RESTful API server for car rental booking application(CARPLAT in Google Play).
- Built and deployed overall service infrastructure utilizing Docker container, CircleCI, and several AWS stack(Including EC2, ECS, Route 53, S3, CloudFront, RDS, ElastiCache, IAM), focusing on high-availability, fault tolerance, and auto-scaling.
- Developed an easy-to-use Payment module which connects to major PG(Payment Gateway) companies in Korea.

**Software Engineer & Security Researcher (Compulsory Military Service) · R.O.K Cyber Command, MND · Seoul · Aug. 2014 - Apr. 2016**
- Lead engineer on agent-less backtracking system that can discover client device's fingerprint(including public and private IP) independently of the Proxy, VPN and NAT.

## 4. Honors & Awards 형식

`수상명 | 대회 | 장소 | 연도`. 예: *2nd Place | AWS ASEAN AI/ML GameDay | Online | 2021* · *Finalist | DEFCON 28th CTF Hacking Competition World Final | Las Vegas, U.S.A | 2020*. 소제목으로 International Awards / Domestic Awards를 나눈다.

## 5. Education 원문

*B.S. in Computer Science and Engineering · POSTECH(Pohang University of Science and Technology) · Pohang, S.Korea · Mar. 2010 - Aug. 2017* — Got a Chun Shin-Il Scholarship which is given to promising students in CSE Dept.

---

## 6. 뼈대에서 읽히는 것

- **불릿마다 규모 수치가 붙는다.** 3.6 million users · 90% of AWS resources · 30% of AWS costs · 20 enterprise systems · 3 clusters, 300+ pods · 4 VPC, 100+ subnets · 9 nodes, 1 billion documents/month. XYZ 공식의 Y가 거의 빠지지 않는다. 다만 Z(어떻게)가 길어 불릿이 2~3줄이다. r/EngineeringResumes 기준으로는 길고, Pragmatic Engineer 기준으로는 허용 범위다.
- **병역을 경력으로 쓴다.** *"(Compulsory Military Service)"* 를 직함 옆에 붙이고 한 일을 불릿으로 적는다. 국내 이력서 관행(병역란)을 해외 형식으로 옮기는 예다.
- **한 달짜리 경력을 숨기지 않고 제목만 남긴다.** 회사 이동 경로를 정직하게 보여준다.
- **도메인 어휘.** 인프라 조직이 스스로를 설명하는 단어: declarative management, GitOps, standardized modules, observability, distributed tracing, cost, security compliance, HA, DLQ, retry. 지원 원고의 기술 스택 줄과 불릿 어휘를 고를 때 대조한다. 단, 이 사람은 15년차 인프라 리드이고 우리는 신입 백엔드다. **어휘를 빌리되 규모를 흉내 내지 않는다.**
- Summary 두 문단은 신입에게는 과하다. TIH 기준 50단어를 지킨다.
