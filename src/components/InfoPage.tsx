import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export function InfoPage({
  eyebrow,
  title,
  description,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: { title: string; body: string }[];
}) {
  return (
    <PageChrome>
      <section className={styles.content}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.grid}>
          {sections.map((section) => (
            <article className={styles.card} key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </PageChrome>
  );
}
