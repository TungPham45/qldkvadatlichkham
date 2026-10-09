import { hospitalName, hospitalSubtitle } from '../utils/format';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-surface wide:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-navy-900 to-[#164a93] p-12 text-white wide:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[10px] bg-primary-600 font-bold">+</div>
          <div>
            <strong className="block text-sm leading-snug">{hospitalName}</strong>
            <span className="mt-0.5 block text-xs text-[#b7c6da]">{hospitalSubtitle}</span>
          </div>
        </div>
        <div>
          <h1 className="max-w-[520px] text-[40px] font-semibold leading-tight">Đặt lịch khám và điều phối lịch làm việc trên một cổng thông tin.</h1>
          <p className="mt-3 max-w-[460px] text-[#d5e4f7]">Bệnh nhân đặt lịch theo ca đã duyệt. Bác sĩ đăng ký ca. Quản lý phê duyệt trước khi lịch được mở.</p>
        </div>
        <span>Dữ liệu lấy từ hệ thống phòng khám.</span>
      </section>
      <section className="grid place-items-center px-5 py-8">{children}</section>
    </div>
  );
}
