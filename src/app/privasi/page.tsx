import Link from "next/link";
import { brand } from "@/brand";
import { privacyEmail, privacyMailto } from "@/core/privacy-contact";

export const metadata = { title: "Kebijakan Privasi" };

const UPDATED = "17 Oktober 2026";

/**
 * Static privacy policy (GAP #6; PDF Tabel 7 "Kebijakan privasi & DPA (UU 27/2022)", §C.3 Tabel 10,
 * §E.2). Public: linked from the landing page and Pengaturan. No session, no data.
 */
export default function PrivacyPage() {
  // Inlined at build (NEXT_PUBLIC_*); unset or invalid → the "not set yet" text below.
  const email = privacyEmail(process.env.NEXT_PUBLIC_PRIVACY_EMAIL);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 text-sm leading-relaxed">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground">{brand.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Kebijakan Privasi</h1>
        <p className="text-muted-foreground">Berlaku sejak {UPDATED}</p>
      </header>

      <p>
        {brand.name} membantu pemilik toko mencatat stok, penjualan, dan keuangan, serta menjawab chat pembeli. Kebijakan ini menjelaskan data
        apa yang kami simpan, untuk apa, dan apa hakmu, sesuai Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022).
      </p>

      <Section title="Data yang kami kumpulkan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Akun pemilik: email dan nama toko.</li>
          <li>Data toko yang kamu masukkan: produk, varian, harga, modal (HPP), stok, penjualan, pengeluaran, dan pelanggan (nama, nomor HP).</li>
          <li>Chat pembeli di widget toko: isi pesan dan kode sesi acak. Kami tidak meminta nama atau nomor HP pembeli di widget.</li>
          <li>Catatan teknis: waktu akses dan penggunaan AI (jumlah token, biaya) untuk menjaga layanan tetap jalan.</li>
        </ul>
      </Section>

      <Section title="Untuk apa data dipakai">
        <p>
          Hanya untuk menjalankan fitur untukmu: menghitung stok dan untung, memberi peringatan, dan menjawab pembeli. Pesan pembeli dan
          pertanyaan konsultasi diproses oleh penyedia model AI (Google Gemini) hanya untuk membuat jawaban. Angka keuangan dihitung oleh
          sistem, bukan oleh AI. Asisten chat pembeli tidak pernah melihat modal atau margin tokomu.
        </p>
      </Section>

      <Section title="Pemisahan data antar-toko">
        <p>
          Setiap toko hanya bisa membaca datanya sendiri. Aturan ini dijaga langsung di basis data (row level security), bukan hanya di
          aplikasi. Data disimpan di Supabase (server Singapura) dan dikirim lewat koneksi terenkripsi (HTTPS).
        </p>
      </Section>

      <Section title="Pemroses data">
        <p>Untuk menjalankan layanan, data diproses oleh penyedia berikut atas nama kami, sebatas yang dibutuhkan fiturnya:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase: basis data dan login (server Singapura). Menyimpan akun dan semua data toko.</li>
          <li>Vercel: hosting aplikasi dan fungsi server. Data toko melewatinya saat kamu memakai aplikasi, beserta catatan teknis akses.</li>
          <li>
            Penyedia model AI (saat ini Google Gemini): menerima isi chat pembeli, pertanyaan Konsultasi, dan hasil hitungan sistem yang
            dibutuhkan untuk menyusun jawaban. Untuk chat pembeli, modal dan margin tidak pernah dikirim.
          </li>
          <li>Pengiriman email login (Resend): alamat email saat kamu meminta kode masuk.</li>
        </ul>
      </Section>

      <Section title="Data tidak dijual">
        <p>Kami tidak menjual atau menyewakan data toko maupun data pembelimu kepada siapa pun, dan tidak memakainya untuk iklan.</p>
      </Section>

      <Section title="Ekspor data">
        <p>
          Kamu bisa mengunduh semua data toko kapan saja dari menu Pengaturan → Data &amp; privasi. Hasilnya satu file ZIP berisi CSV: produk,
          varian, penjualan, item penjualan, pengeluaran, pelanggan, percakapan, dan pesan.
        </p>
      </Section>

      <Section title="Hapus toko">
        <p>
          Penghapusan dilakukan dua tahap dari menu Pengaturan. Tahap 1: toko dijadwalkan dihapus dan langsung ditutup untuk pembeli; selama
          7 hari kamu masih bisa mengekspor data atau membatalkan. Tahap 2: setelah 7 hari, atau saat kamu memilih hapus permanen, semua data
          toko dihapus dari basis data dan tidak bisa dikembalikan.
        </p>
      </Section>

      <Section title="Hapus akun">
        <p>
          Kamu bisa menghapus akunmu sendiri dari menu Akun. Akunmu dikeluarkan dari semua toko dan toko demo milikmu ikut terhapus. Kalau
          kamu satu-satunya pemilik sebuah toko, hapus toko itu dulu atau serahkan ke pemilik lain.
        </p>
      </Section>

      <Section title="Hakmu">
        <p>
          Sesuai UU PDP kamu berhak mengakses, memperbaiki, mengunduh, dan menghapus data pribadimu, serta menarik persetujuan. Sebagian besar
          bisa kamu lakukan sendiri di aplikasi. Pembeli yang ingin datanya dihapus dapat menghubungi pemilik toko, atau kami.
        </p>
      </Section>

      <Section title="Hubungi kami">
        {email ? (
          <p>
            Pertanyaan atau permintaan soal data pribadi (akses, perbaikan, penghapusan) kirim ke{" "}
            <a href={privacyMailto(email)} className="font-medium text-primary underline-offset-4 hover:underline">
              {email}
            </a>
            , sebaiknya dari email akunmu agar kami bisa memastikan pemiliknya. Kami menanggapi paling lambat 24 jam.
          </p>
        ) : (
          <p>
            Alamat email resmi untuk permintaan data pribadi belum ditetapkan. Sementara itu, kamu bisa mengunduh atau menghapus data toko di
            Pengaturan → Data &amp; privasi, dan menghapus akunmu di menu Akun.
          </p>
        )}
      </Section>

      <p>
        <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
          Kembali ke beranda
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
