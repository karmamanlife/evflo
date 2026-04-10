export default function Logo({ size = 'md' }) {
  const sizes = { sm: '1.4rem', md: '1.9rem', lg: '2.6rem' };
  return (
    <div className="evflo-logo" style={{ fontSize: sizes[size] }}>
      <div className="logo-crosshair" style={{
        width: size === 'lg' ? '28px' : '22px',
        height: size === 'lg' ? '28px' : '22px'
      }} />
      <span className="ev">ev</span>
      <span className="flo">flo</span>
    </div>
  );
}
